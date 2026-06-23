// src/config.js — Load and validate configuration from environment.

'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Single source of truth (deployments/base-sepolia.json) → regenerate with
// `node scripts/gen-addresses.mjs` after any redeploy.
const sepolia = require('./addresses.generated.js');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ── Known deployments ────────────────────────────────────────────────────

const DEPLOYMENTS = {
  baseSepolia: {
    chainId: 84532,
    name: 'Base Sepolia',
    defaultRpc: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    contracts: sepolia.contracts,
    // Lower bound for event scans (from the generated single source).
    deployBlock: sepolia.deployBlock,
  },
  base: {
    chainId: 8453,
    name: 'Base',
    defaultRpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    contracts: {
      // Filled in at mainnet launch.
      MktbToken: '',
      ExecutorRewards: '',
      MaktubCore: '',
      RecipientRegistry: '',
      ExecutionRelay: '',
    },
    deployBlock: 0,
  },
  // Local devnet (Hardhat node). Addresses default to the deterministic ones a fresh
  // `npx hardhat node` + `scripts/deploy.js` produces (fixed deployer + nonce order); each
  // is overridable via env for any other local deploy. Test-rig only — never a real network.
  localhost: {
    chainId: Number(process.env.LOCAL_CHAIN_ID || 31337),
    name: 'Localhost devnet',
    defaultRpc: process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545',
    explorer: '',
    contracts: {
      MktbToken: process.env.LOCAL_MKTB_TOKEN || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
      ExecutorRewards:
        process.env.LOCAL_EXECUTOR_REWARDS || '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
      MaktubCore: process.env.LOCAL_MAKTUB_CORE || '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
      RecipientRegistry:
        process.env.LOCAL_RECIPIENT_REGISTRY || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      ExecutionRelay: process.env.LOCAL_EXECUTION_RELAY || '',
    },
    deployBlock: Number(process.env.LOCAL_START_BLOCK || 0),
  },
};

// ── Parsing helpers ──────────────────────────────────────────────────────

function bool(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).toLowerCase() === 'true' || v === '1';
}

function num(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePrivateKey(pk) {
  if (!pk) return null;
  const k = pk.trim();
  if (k.startsWith('0x')) return k;
  return '0x' + k;
}

// ── Build config ─────────────────────────────────────────────────────────

function load() {
  const network = (process.env.NETWORK || 'baseSepolia').trim();
  const deployment = DEPLOYMENTS[network];

  if (!deployment) {
    throw new Error(
      `Unknown NETWORK "${network}". Valid values: ${Object.keys(DEPLOYMENTS).join(', ')}`,
    );
  }

  const privateKey = normalizePrivateKey(process.env.PRIVATE_KEY);
  if (!privateKey || privateKey.length !== 66) {
    throw new Error(
      'PRIVATE_KEY is missing or malformed. Must be a 32-byte hex string (64 hex chars, optional 0x prefix).',
    );
  }

  const rpcUrl = (process.env.RPC_URL || deployment.defaultRpc).trim();
  if (!rpcUrl) throw new Error('RPC_URL is required.');

  // Sanity-check that the mainnet contracts are filled in when running on base.
  if (network === 'base' && !deployment.contracts.MaktubCore) {
    throw new Error(
      'Base mainnet contracts are not configured yet. Run against baseSepolia for now.',
    );
  }

  return {
    network,
    chainId: deployment.chainId,
    networkName: deployment.name,
    rpcUrl,
    explorer: deployment.explorer,
    privateKey,
    contracts: deployment.contracts,
    deployBlock: num(process.env.START_BLOCK, deployment.deployBlock),
    pollIntervalMs: num(process.env.POLL_INTERVAL_SECONDS, 60) * 1000,
    autoStake: bool(process.env.AUTO_STAKE, true),
    autoRestake: bool(process.env.AUTO_RESTAKE, false),
    // Gas-runway alerting (issue #48): warn when the wallet can no longer
    // fund this many executions at the CURRENT gas price. Dynamic by design —
    // a fixed wei threshold goes stale across gas spikes and networks.
    gasRunwayMinExecutions: num(process.env.GAS_RUNWAY_MIN_EXECUTIONS, 25),
    gasPerExecution: num(process.env.GAS_PER_EXECUTION, 400_000),
  };
}

// Redacted version, safe to log at startup.
function describe(cfg) {
  return {
    network: cfg.networkName,
    chainId: cfg.chainId,
    rpcUrl: cfg.rpcUrl,
    pollIntervalSeconds: cfg.pollIntervalMs / 1000,
    autoStake: cfg.autoStake,
    autoRestake: cfg.autoRestake,
    gasRunwayMinExecutions: cfg.gasRunwayMinExecutions,
    contracts: cfg.contracts,
  };
}

module.exports = { load, describe, DEPLOYMENTS };
