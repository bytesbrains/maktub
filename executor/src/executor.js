// src/executor.js — Submit execute() calls for expired heartbeats.
//
// Design:
//   - Best-effort: if execute() reverts (e.g. timer not actually expired, or
//     someone else front-ran us), we log and move on.
//   - We NEVER retry a transaction we believe already landed on-chain — we
//     just let the live HeartbeatExecuted subscription prune our state.

'use strict';

const { ethers } = require('ethers');
const { log, warn } = require('./log');

const CORE_ABI = [
  'function execute(uint256 id)',
  'function isExpired(uint256 id) view returns (bool)',
  'function isExecutor(address account) view returns (bool)',
  'function getHeartbeat(uint256 id) view returns (address owner, address[] recipients, bytes payload, uint256 interval, uint256 lastCheckIn, uint256 createdAt, uint256 checkInCount, bool executed, bool deactivated)',
  'event HeartbeatExecuted(uint256 indexed id, address indexed executor, uint256 timestamp)',
];

// Pre-submit jitter window. When many executors race for the same heartbeat,
// each node sleeps a random [0, MAX_JITTER_MS) before broadcasting execute().
// The shortest-jitter node's tx lands; the others re-check state after their
// sleep and skip, avoiding a guaranteed-revert tx. 1200ms is ~½–¾ of a Base
// block, wide enough to desynchronise submissions without meaningfully
// delaying legitimate execution of a long-expired heartbeat.
const MAX_JITTER_MS = 1200;

const REWARDS_ABI = [
  'function distributeReward(address executor, uint256 heartbeatId)',
  'function CORE_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
];

const RELAY_ABI = [
  'function executeAndReward(uint256 heartbeatId) returns (uint256 rewardAmount)',
  'event ExecutionCompleted(uint256 indexed heartbeatId, address indexed executor, uint256 rewardAmount)',
  'event RewardSkipped(uint256 indexed heartbeatId, address indexed executor, bytes reason)',
];

class ExecutorBot {
  constructor(wallet, cfg) {
    this.wallet = wallet;
    this.cfg = cfg;
    this.core = new ethers.Contract(cfg.contracts.MaktubCore, CORE_ABI, wallet);
    this.rewards = new ethers.Contract(cfg.contracts.ExecutorRewards, REWARDS_ABI, wallet);
    // Preferred execution path: the relay couples execute() with best-effort
    // MKTB reward distribution in one tx. Falls back to direct core.execute()
    // when no relay is configured for the network.
    this.relay = cfg.contracts.ExecutionRelay
      ? new ethers.Contract(cfg.contracts.ExecutionRelay, RELAY_ABI, wallet)
      : null;
    this.inflight = new Set(); // ids we've already submitted a tx for
    this.executedCount = 0;
  }

  async _canSelfDistribute() {
    try {
      const role = await this.rewards.CORE_ROLE();
      return await this.rewards.hasRole(role, this.wallet.address);
    } catch (_) {
      return false;
    }
  }

  async executeOne(hb) {
    const key = hb.id.toString();
    if (this.inflight.has(key)) return;
    this.inflight.add(key);

    try {
      // Anti-race jitter: sleep a random slice of MAX_JITTER_MS so that,
      // when N executors observe the same expiry tick, their submissions
      // desynchronise. The shortest-jitter node effectively becomes the
      // "winner" for this round; the others will see `executed=true` in
      // the re-check below and skip. Cost of jitter is a single setTimeout
      // per eligible heartbeat — free in practice.
      const jitterMs = Math.floor(Math.random() * MAX_JITTER_MS);
      if (jitterMs) await new Promise(r => setTimeout(r, jitterMs));

      // Authoritative on-chain re-check AFTER the jitter. Uses getHeartbeat
      // (not just isExpired) because isExpired only checks the timer and
      // returns true even for already-executed heartbeats — which would
      // leave a guaranteed-revert tx on the table. Reading both `executed`
      // and the timer fields in one call prunes losers cleanly.
      let hbState;
      try {
        hbState = await this.core.getHeartbeat(hb.id);
      } catch (e) {
        warn(`[executor] getHeartbeat(${hb.id}) failed: ${e.shortMessage || e.message}`);
        return;
      }
      const [, , , interval, lastCheckIn, , , executed, deactivated] = hbState;
      if (executed) {
        log(`[executor] id=${hb.id} already executed by a peer. Skipping.`);
        return;
      }
      if (deactivated) {
        log(`[executor] id=${hb.id} was deactivated. Skipping.`);
        return;
      }
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      if (nowSec <= BigInt(lastCheckIn) + BigInt(interval)) {
        log(`[executor] id=${hb.id} no longer expired (owner checked in?). Skipping.`);
        return;
      }

      const via = this.relay ? 'relay.executeAndReward' : 'core.execute';
      log(`[executor] Submitting ${via}(${hb.id}) (jitter=${jitterMs}ms)…`);
      let tx;
      try {
        // Relay path: executes AND credits the MKTB reward in one tx. The
        // relay is execution-first — if this heartbeat is reward-ineligible
        // (younger than MIN_HEARTBEAT_AGE, zero check-ins), execution still
        // lands and RewardSkipped is emitted instead of reverting.
        tx = this.relay
          ? await this.relay.executeAndReward(hb.id)
          : await this.core.execute(hb.id);
      } catch (e) {
        // Common: someone else's tx landed first, reverting ours at simulation.
        const msg = e.shortMessage || e.reason || e.message;
        warn(`[executor] ${via}(${hb.id}) failed to submit: ${msg}`);
        return;
      }
      log(`[executor]   tx: ${tx.hash}`);
      let receipt;
      try {
        receipt = await tx.wait();
      } catch (e) {
        warn(`[executor] ${via}(${hb.id}) reverted on-chain: ${e.shortMessage || e.message}`);
        return;
      }

      this.executedCount++;
      log(`[executor] EXECUTED id=${hb.id} in block ${receipt.blockNumber}. Total executions: ${this.executedCount}.`);

      if (this.relay) {
        // Surface the reward outcome from the relay's events.
        for (const lg of receipt.logs) {
          let ev;
          try { ev = this.relay.interface.parseLog(lg); } catch (_) { continue; }
          if (ev?.name === 'ExecutionCompleted') {
            log(`[executor] Reward credited: ${ethers.formatEther(ev.args.rewardAmount)} MKTB.`);
          } else if (ev?.name === 'RewardSkipped') {
            log('[executor] Reward skipped (heartbeat not reward-eligible — execution still counts).');
          }
        }
      } else {
        // Legacy direct path: best-effort self-distribution, which only works
        // if this wallet itself holds CORE_ROLE (rare; relays normally do this).
        try {
          const hasCore = await this._canSelfDistribute();
          if (hasCore) {
            log(`[executor] Claiming reward via distributeReward(${hb.id})…`);
            const rtx = await this.rewards.distributeReward(this.wallet.address, hb.id);
            await rtx.wait();
            log(`[executor] Reward distributed. tx: ${rtx.hash}`);
          } else {
            log('[executor] Wallet does not hold CORE_ROLE — no reward on the direct path.');
          }
        } catch (e) {
          warn(`[executor] distributeReward failed (non-fatal): ${e.shortMessage || e.message}`);
        }
      }
    } finally {
      this.inflight.delete(key);
    }
  }

  async executeBatch(heartbeats) {
    // Serial, not parallel: avoids nonce races and keeps logs readable.
    for (const hb of heartbeats) {
      await this.executeOne(hb);
    }
  }
}

module.exports = { ExecutorBot };
