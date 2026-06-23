// src/staking.js — Ensure the executor wallet is staked; optionally restake rewards.

'use strict';

const { ethers } = require('ethers');
const { log, warn } = require('./log');

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const REWARDS_ABI = [
  'function minimumStake() view returns (uint256)',
  'function stakes(address) view returns (uint256)',
  'function isActiveExecutor(address) view returns (bool)',
  'function rewardsEarned(address) view returns (uint256)',
  'function totalStaked() view returns (uint256)',
  'function remainingRewardPool() view returns (uint256)',
  'function currentRewardAmount() view returns (uint256)',
  'function stake(uint256 amount)',
  'function unstake(uint256 amount)',
  'event ExecutorStaked(address indexed executor, uint256 amount, uint256 totalStake)',
  'event RewardDistributed(address indexed executor, uint256 amount)',
];

function fmt(amount, decimals = 18) {
  return ethers.formatUnits(amount, decimals);
}

async function getContracts(wallet, cfg) {
  const token = new ethers.Contract(cfg.contracts.MktbToken, ERC20_ABI, wallet);
  const rewards = new ethers.Contract(
    cfg.contracts.ExecutorRewards,
    REWARDS_ABI,
    wallet,
  );
  return { token, rewards };
}

// Return a snapshot of the executor's on-chain state.
async function snapshot(wallet, cfg) {
  const { token, rewards } = await getContracts(wallet, cfg);
  const [
    symbol,
    decimals,
    mktbBalance,
    staked,
    isActive,
    minimumStake,
    rewardsEarned,
    currentReward,
    remainingPool,
  ] = await Promise.all([
    token.symbol(),
    token.decimals(),
    token.balanceOf(wallet.address),
    rewards.stakes(wallet.address),
    rewards.isActiveExecutor(wallet.address),
    rewards.minimumStake(),
    rewards.rewardsEarned(wallet.address),
    rewards.currentRewardAmount(),
    rewards.remainingRewardPool(),
  ]);
  return {
    symbol,
    decimals: Number(decimals),
    mktbBalance,
    staked,
    isActive,
    minimumStake,
    rewardsEarned,
    currentReward,
    remainingPool,
  };
}

// Ensure the executor is active. If not, approve + stake the minimum.
async function ensureStaked(wallet, cfg) {
  const { token, rewards } = await getContracts(wallet, cfg);
  const snap = await snapshot(wallet, cfg);

  log(
    `[staking] ${snap.symbol} balance: ${fmt(snap.mktbBalance, snap.decimals)} | ` +
      `staked: ${fmt(snap.staked, snap.decimals)} | ` +
      `minimum: ${fmt(snap.minimumStake, snap.decimals)} | ` +
      `active: ${snap.isActive}`,
  );

  if (snap.isActive) {
    log('[staking] Executor is already active. No staking needed.');
    return snap;
  }

  if (!cfg.autoStake) {
    warn('[staking] Not active and AUTO_STAKE=false. Refusing to stake automatically.');
    warn(`[staking] Stake at least ${fmt(snap.minimumStake, snap.decimals)} ${snap.symbol} manually, then restart.`);
    return snap;
  }

  const shortfall = snap.minimumStake - snap.staked;
  if (shortfall <= 0n) {
    warn('[staking] Stake already meets minimum but isActiveExecutor is false. Odd; check contract state.');
    return snap;
  }

  if (snap.mktbBalance < shortfall) {
    throw new Error(
      `Insufficient ${snap.symbol} balance. Need ${fmt(shortfall, snap.decimals)} ` +
        `more, have ${fmt(snap.mktbBalance, snap.decimals)}. ` +
        `Fund ${wallet.address} with MKTB and try again.`,
    );
  }

  const allowance = await token.allowance(wallet.address, cfg.contracts.ExecutorRewards);
  if (allowance < shortfall) {
    log(`[staking] Approving ExecutorRewards to spend ${fmt(shortfall, snap.decimals)} ${snap.symbol}…`);
    const approveTx = await token.approve(cfg.contracts.ExecutorRewards, shortfall);
    log(`[staking]   tx: ${approveTx.hash}`);
    await approveTx.wait();
  }

  log(`[staking] Staking ${fmt(shortfall, snap.decimals)} ${snap.symbol}…`);
  const stakeTx = await rewards.stake(shortfall);
  log(`[staking]   tx: ${stakeTx.hash}`);
  const receipt = await stakeTx.wait();
  log(`[staking] Staked in block ${receipt.blockNumber}. Re-checking status…`);

  const after = await snapshot(wallet, cfg);
  if (after.isActive) {
    log('[staking] Executor is now ACTIVE. Welcome to the network.');
  } else {
    warn('[staking] Still not active after staking. Investigate.');
  }
  return after;
}

// Compound earned rewards into additional stake.
async function restakeRewards(wallet, cfg) {
  if (!cfg.autoRestake) return;
  const { token, rewards } = await getContracts(wallet, cfg);
  const snap = await snapshot(wallet, cfg);

  // We restake from the current unstaked MKTB balance (rewards land in the
  // wallet's balance when distributed).
  const balance = snap.mktbBalance;
  // Leave a dust floor so approval/stake succeed with a clean number.
  const minRestake = ethers.parseUnits('1', snap.decimals);
  if (balance < minRestake) return;

  log(`[staking] Auto-restaking ${fmt(balance, snap.decimals)} ${snap.symbol}…`);
  const allowance = await token.allowance(wallet.address, cfg.contracts.ExecutorRewards);
  if (allowance < balance) {
    const approveTx = await token.approve(cfg.contracts.ExecutorRewards, balance);
    await approveTx.wait();
  }
  const tx = await rewards.stake(balance);
  await tx.wait();
  log(`[staking] Restaked. tx: ${tx.hash}`);
}

module.exports = { ensureStaked, restakeRewards, snapshot, getContracts, fmt };
