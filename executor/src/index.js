#!/usr/bin/env node
// src/index.js — Maktub executor node entry point.
//
//   1. Load config from .env
//   2. Connect to the RPC, verify chain id
//   3. Ensure we're staked (or stake the minimum if AUTO_STAKE=true)
//   4. Bootstrap the monitor with historical heartbeats
//   5. Subscribe to live events and poll on an interval
//   6. Execute any expired heartbeat we find
//   7. Shut down cleanly on SIGINT/SIGTERM

'use strict';

const { ethers } = require('ethers');
const { load: loadConfig, describe } = require('./config');
const { log, warn, err } = require('./log');
const { Monitor } = require('./monitor');
const { ExecutorBot } = require('./executor');
const { ensureStaked, restakeRewards, snapshot, fmt } = require('./staking');

const STATUS_MODE = process.argv.includes('--status');

function banner() {
  log('┌──────────────────────────────────────────────┐');
  log('│  Maktub Protocol — Executor Node             │');
  log('│  https://maktub.it                           │');
  log('└──────────────────────────────────────────────┘');
}

async function connect(cfg) {
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
  const wallet = new ethers.Wallet(cfg.privateKey, provider);

  // Verify chain id matches the configured network.
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== cfg.chainId) {
    throw new Error(
      `RPC chain id ${net.chainId} does not match configured NETWORK (${cfg.networkName}, ${cfg.chainId}).`,
    );
  }

  const [block, balance] = await Promise.all([
    provider.getBlockNumber(),
    provider.getBalance(wallet.address),
  ]);

  log(`[conn] Connected to ${cfg.networkName} (chainId=${cfg.chainId}) at block ${block}`);
  log(`[conn] Wallet: ${wallet.address}`);
  log(`[conn] ETH balance: ${ethers.formatEther(balance)}`);

  if (balance === 0n) {
    warn('[conn] Wallet has 0 ETH. You need gas to submit transactions.');
  }

  return { provider, wallet, startBlock: block };
}

// Gas runway = how many executions the wallet can fund at the CURRENT gas
// price (issue #48). An empty wallet is a silent liveness failure — the node
// keeps ticking normally while every execute() would bounce — so the runway
// is surfaced on every tick and a warning fires while it is below the floor.
async function gasRunway(provider, walletAddress, cfg) {
  const [balance, feeData] = await Promise.all([
    provider.getBalance(walletAddress),
    provider.getFeeData(),
  ]);
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (!gasPrice || gasPrice === 0n) return { balance, executions: null };
  const costPerExecution = gasPrice * BigInt(cfg.gasPerExecution);
  return { balance, executions: Number(balance / costPerExecution) };
}

function warnIfRunwayLow(runway, cfg) {
  if (runway.executions !== null && runway.executions < cfg.gasRunwayMinExecutions) {
    warn(
      `[gas] LOW BALANCE: ${ethers.formatEther(runway.balance)} ETH funds only ` +
        `~${runway.executions} executions at the current gas price ` +
        `(floor: ${cfg.gasRunwayMinExecutions}). Top up the wallet.`,
    );
  }
}

async function main() {
  banner();

  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    err(`Config error: ${e.message}`);
    process.exit(1);
  }

  log('[boot] Config:', JSON.stringify(describe(cfg), null, 2));

  const { provider, wallet, startBlock } = await connect(cfg);

  if (!cfg.deployBlock) {
    // Start from ~500k blocks back if the user didn't pin a deploy block.
    cfg.deployBlock = startBlock > 500_000 ? startBlock - 500_000 : 0;
  }

  // 1) Staking
  const snap = await ensureStaked(wallet, cfg);
  if (!snap.isActive) {
    err('[boot] Wallet is not an active executor. Cannot proceed. Stake MKTB and retry.');
    process.exit(1);
  }
  log(
    `[boot] Earnings summary: current reward/execution=${fmt(snap.currentReward, snap.decimals)} ${snap.symbol} | ` +
      `your earnings=${fmt(snap.rewardsEarned, snap.decimals)} ${snap.symbol} | ` +
      `pool remaining=${fmt(snap.remainingPool, snap.decimals)} ${snap.symbol}`,
  );

  // 2) Monitor
  const monitor = new Monitor(provider, wallet, cfg);
  await monitor.bootstrap();

  // 3) Executor bot
  const bot = new ExecutorBot(wallet, cfg);

  if (STATUS_MODE) {
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const summary = monitor.summarize(nowSec);
    log(`[status] Tracking ${summary.total} heartbeats. Expired now: ${summary.expired}.`);
    const runway = await gasRunway(provider, wallet.address, cfg);
    log(
      `[status] Gas runway: ${ethers.formatEther(runway.balance)} ETH ≈ ` +
        `${runway.executions === null ? 'n/a' : `~${runway.executions} executions`} at current gas price.`,
    );
    warnIfRunwayLow(runway, cfg);
    if (summary.nearestRemainingSec !== null) {
      const s = Number(summary.nearestRemainingSec);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      log(`[status] Nearest expiry in ${h}h${m}m (${s}s).`);
    }
    await monitor.unsubscribe();
    process.exit(0);
  }

  // 4) Main loop
  let shuttingDown = false;
  let ticking = false;

  const tick = async () => {
    if (shuttingDown || ticking) return;
    ticking = true;
    try {
      // Ingest any new on-chain events since last tick.
      await monitor.pollEvents();

      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      const expired = monitor.expired(nowSec);

      const summary = monitor.summarize(nowSec);
      const nearest = summary.nearestRemainingSec;
      const nearestStr =
        nearest === null
          ? 'n/a'
          : `${Math.floor(Number(nearest) / 3600)}h${Math.floor((Number(nearest) % 3600) / 60)}m`;
      const runway = await gasRunway(provider, wallet.address, cfg);
      const runwayStr = runway.executions === null ? 'n/a' : `~${runway.executions}`;
      log(
        `[tick] tracking=${summary.total} expired=${summary.expired} ` +
          `nearest=${nearestStr} executed=${bot.executedCount} ` +
          `gas=${ethers.formatEther(runway.balance)} runway=${runwayStr}`,
      );
      warnIfRunwayLow(runway, cfg);

      if (expired.length > 0) {
        log(`[tick] Attempting to execute ${expired.length} heartbeat(s)…`);
        await bot.executeBatch(expired);
      }

      if (cfg.autoRestake) {
        try {
          await restakeRewards(wallet, cfg);
        } catch (e) {
          warn(`[tick] restake failed: ${e.shortMessage || e.message}`);
        }
      }
    } catch (e) {
      err(`[tick] unhandled error: ${e.stack || e.message}`);
    } finally {
      ticking = false;
    }
  };

  // Deterministic per-executor tick offset derived from the wallet address.
  // When multiple executors run against the same network, an identical tick
  // schedule would have them all scan, detect expired heartbeats, and submit
  // execute() in the same ~2s Base block — wasting gas on guaranteed reverts
  // (defended in-contract, but still waste). The address-derived offset
  // spreads the tick phase across the poll interval deterministically, so
  // two executors never realign after a restart. Random jitter on the actual
  // execute() submission (executor.js) handles sub-tick collisions.
  const addrHash = BigInt('0x' + wallet.address.slice(2).toLowerCase());
  const tickOffsetMs = Number(addrHash % BigInt(cfg.pollIntervalMs));
  log(`[boot] Tick offset ${tickOffsetMs}ms of ${cfg.pollIntervalMs}ms (deterministic from wallet).`);

  await tick(); // fire one immediately so we don't wait a full interval on boot
  await new Promise(r => setTimeout(r, tickOffsetMs));
  const interval = setInterval(tick, cfg.pollIntervalMs);

  // 5) Graceful shutdown
  const shutdown = async signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`[shutdown] Caught ${signal}. Cleaning up…`);
    clearInterval(interval);
    try {
      await monitor.unsubscribe();
    } catch (e) {
      warn(`[shutdown] unsubscribe error: ${e.message}`);
    }
    try {
      if (provider.destroy) provider.destroy();
    } catch (_) {
      /* ignore */
    }
    log('[shutdown] Done. Bye.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', e => {
    err(`[fatal] uncaughtException: ${e.stack || e.message}`);
  });
  process.on('unhandledRejection', e => {
    err(`[fatal] unhandledRejection: ${e && (e.stack || e.message || e)}`);
  });
}

main().catch(e => {
  err(`[fatal] ${e.stack || e.message}`);
  process.exit(1);
});
