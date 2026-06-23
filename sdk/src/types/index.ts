/**
 * TypeScript type definitions for the Maktub Protocol SDK.
 *
 * @module
 */

import type {
  ContractTransactionResponse,
  ContractTransactionReceipt,
  Provider,
  Signer,
} from "ethers";

// ──────────────────────────────────────────────
//  Network & Configuration
// ──────────────────────────────────────────────

/** Deployed contract addresses for a single network. */
export interface ContractAddresses {
  /** MaktubCore contract address. */
  maktubCore: string;
  /** RecipientRegistry contract address. */
  recipientRegistry: string;
  /** MktbToken contract address. */
  mktbToken: string;
  /** ExecutorRewards contract address. */
  executorRewards: string;
  /** MktbGovernance contract address. */
  mktbGovernance: string;
  /** ExecutionRelay contract address (execute + reward in one tx). */
  executionRelay?: string;
  /** RecipientRegistryV2 contract address (typed key slots, Flash substrate). */
  recipientRegistryV2?: string;
  /** MaktubFlash contract address (instant-triggered citizen). */
  maktubFlash?: string;
}

/** Network configuration including chain ID and contract addresses. */
export interface NetworkConfig {
  /** EVM chain ID. */
  chainId: number;
  /** Human-readable network name (e.g. "Base", "Base Sepolia"). */
  name: string;
  /** Deployed contract addresses on this network. */
  contracts: ContractAddresses;
}

/** Configuration options for the MaktubClient. */
export interface MaktubClientConfig {
  /** An ethers v6 Provider for read-only calls. */
  provider: Provider;
  /** An ethers v6 Signer for write transactions. Optional for read-only usage. */
  signer?: Signer;
  /** Contract addresses override. If omitted, addresses are resolved from the provider's chain ID. */
  addresses?: ContractAddresses;
}

// ──────────────────────────────────────────────
//  Heartbeat
// ──────────────────────────────────────────────

/** On-chain heartbeat data returned by MaktubCore.getHeartbeat(). */
export interface HeartbeatInfo {
  /** The heartbeat owner address. */
  owner: string;
  /** Array of recipient addresses. */
  recipients: string[];
  /** IPFS CID hash of the encrypted payload (hex-encoded bytes). */
  payload: string;
  /** Check-in interval in seconds. */
  interval: bigint;
  /** Timestamp of the last check-in (or creation). */
  lastCheckIn: bigint;
  /** Timestamp when the heartbeat was created. */
  createdAt: bigint;
  /** Number of times the owner has checked in. */
  checkInCount: bigint;
  /** Whether the heartbeat has been irreversibly executed. */
  executed: boolean;
  /** Whether the heartbeat has been permanently deactivated. */
  deactivated: boolean;
}

/** Parameters for creating a new heartbeat. */
export interface CreateHeartbeatParams {
  /** Array of recipient addresses (must all be registered in RecipientRegistry). */
  recipients: string[];
  /** Encrypted payload as bytes (hex string or Uint8Array). Typically an IPFS CID. */
  payload: string | Uint8Array;
  /** Check-in interval in seconds (minimum 1 hour, maximum 365 days). */
  interval: number | bigint;
  /**
   * Optional 32-byte salt (hex string or Uint8Array) that uniquifies the
   * derived beat ID: `id = keccak256(abi.encode(sender, salt))` (D-038).
   * Omit it and the SDK generates a cryptographically-random salt. Reusing a
   * salt for the same sender reverts with `HeartbeatAlreadyExists`.
   */
  salt?: string | Uint8Array;
}

/** Result of creating a heartbeat, including the transaction and heartbeat ID. */
export interface CreateHeartbeatResult {
  /** The transaction response. */
  tx: ContractTransactionResponse;
  /** The deterministic heartbeat ID (`keccak256(abi.encode(sender, salt))`). */
  heartbeatId: bigint;
  /** The 32-byte salt used to derive the ID (hex, `0x`-prefixed). */
  salt: string;
}

// ──────────────────────────────────────────────
//  Flash (instant-triggered citizen)
// ──────────────────────────────────────────────

/** Canonical on-chain flash data returned by MaktubFlash.getFlash(). */
export interface FlashInfo {
  /** The sender address. */
  sender: string;
  /** Array of recipient addresses. */
  recipients: string[];
  /** The encrypted envelope bytes (or a CID), hex-encoded. */
  payload: string;
  /** Block timestamp of the send. */
  timestamp: bigint;
}

/** Result of a flash() send. */
export interface SendFlashResult {
  /** The transaction response. */
  tx: ContractTransactionResponse;
  /** The mined receipt (flash delivery is confirmed when this exists). */
  receipt: ContractTransactionReceipt;
  /** The flash ID assigned by the contract (-1n if the event was not found). */
  flashId: bigint;
  /** The exact fee paid in wei (recipients.length * perRecipientFee). */
  feePaid: bigint;
}

/** A recipient's typed key slots on RecipientRegistryV2. */
export interface RecipientV2Record {
  /** Long-lived ECIES public key ("0x" if not v2-registered). */
  encPubKey: string;
  /** Ratchet public key — non-empty means Flash-eligible. */
  ratchetPubKey: string;
  /** Timestamp of the last encPubKey write (0 = not v2-registered). */
  encUpdatedAt: bigint;
  /** Timestamp of the last ratchetPubKey write. */
  ratchetUpdatedAt: bigint;
}

// ──────────────────────────────────────────────
//  Executor & Staking
// ──────────────────────────────────────────────

/** Executor staking information from ExecutorRewards. */
export interface ExecutorInfo {
  /** Amount of MKTB staked by this executor (in wei). */
  stakeAmount: bigint;
  /** Whether this executor meets the minimum stake requirement. */
  isActive: boolean;
  /** Total MKTB rewards earned by this executor (in wei). */
  rewardsEarned: bigint;
}

/** Emission schedule information from ExecutorRewards. */
export interface EmissionInfo {
  /** Current halving year (0-based). */
  currentYear: bigint;
  /** Current per-execution reward amount in MKTB wei. */
  rewardPerExecution: bigint;
  /** Total MKTB distributed so far (in wei). */
  totalDistributed: bigint;
  /** Remaining MKTB in the reward pool (in wei). */
  remainingPool: bigint;
  /** Total MKTB staked across all executors (in wei). */
  totalStaked: bigint;
  /** Minimum stake required to be an active executor (in wei). */
  minimumStake: bigint;
  /** Whether reward distribution is currently paused. */
  paused: boolean;
}

// ──────────────────────────────────────────────
//  Token
// ──────────────────────────────────────────────

/** MKTB token information. */
export interface TokenInfo {
  /** Token name ("Maktub"). */
  name: string;
  /** Token symbol ("MKTB"). */
  symbol: string;
  /** Token decimals (18). */
  decimals: number;
  /** Current total supply in wei. */
  totalSupply: bigint;
  /** Maximum supply cap in wei (100M * 1e18). */
  maxSupply: bigint;
}

// ──────────────────────────────────────────────
//  Governance
// ──────────────────────────────────────────────

export { ProposalState, VoteType } from "./governance.js";
