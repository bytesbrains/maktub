/**
 * Maktub Protocol SDK
 *
 * TypeScript SDK for interacting with the Maktub Protocol v3 on Base L2.
 *
 * @example
 * ```typescript
 * import { MaktubClient } from "@bytesbrains/maktub-sdk";
 * import { JsonRpcProvider, Wallet } from "ethers";
 *
 * const provider = new JsonRpcProvider("https://mainnet.base.org");
 * const signer = new Wallet(privateKey, provider);
 * const maktub = new MaktubClient({ provider, signer });
 *
 * // Create a heartbeat — the ID is deterministic (keccak256(sender, salt));
 * // omit `salt` and the SDK generates a random one and returns it.
 * const { heartbeatId, salt } = await maktub.createHeartbeat({
 *   recipients: ["0x..."],
 *   payload: "0x...",
 *   interval: 180 * 24 * 3600, // 180 days
 * });
 *
 * // Check in
 * await maktub.checkIn(heartbeatId);
 *
 * // Query
 * const info = await maktub.getHeartbeat(heartbeatId);
 * const remaining = await maktub.timeRemaining(heartbeatId);
 * ```
 *
 * @packageDocumentation
 */

// ── Client ──────────────────────────────────────
export { MaktubClient } from "./MaktubClient.js";

// ── Contract wrappers ───────────────────────────
export { MaktubCoreContract } from "./contracts/MaktubCore.js";
export { beatId } from "./contracts/maktubCore/writeOps.js";
export { RecipientRegistryContract } from "./contracts/RecipientRegistry.js";
export { MktbTokenContract } from "./contracts/MktbToken.js";
export { ExecutorRewardsContract } from "./contracts/ExecutorRewards.js";
export { MktbGovernanceContract } from "./contracts/MktbGovernance.js";
export { RecipientRegistryV2Contract } from "./contracts/RecipientRegistryV2.js";
export { MaktubFlashContract } from "./contracts/MaktubFlash.js";

// ── Types ───────────────────────────────────────
export type {
  MaktubClientConfig,
  ContractAddresses,
  NetworkConfig,
  HeartbeatInfo,
  CreateHeartbeatParams,
  CreateHeartbeatResult,
  FlashInfo,
  SendFlashResult,
  RecipientV2Record,
  ExecutorInfo,
  EmissionInfo,
  TokenInfo,
} from "./types/index.js";
export { ProposalState, VoteType } from "./types/index.js";

// ── Constants ───────────────────────────────────
export {
  MAKTUB_CORE_ABI,
  RECIPIENT_REGISTRY_ABI,
  RECIPIENT_REGISTRY_V2_ABI,
  MAKTUB_FLASH_ABI,
  MKTB_TOKEN_ABI,
  EXECUTOR_REWARDS_ABI,
  MKTB_GOVERNANCE_ABI,
} from "./constants/abis.js";
export {
  BASE_MAINNET,
  BASE_SEPOLIA,
  LOCALHOST,
  NETWORKS,
  getNetworkConfig,
} from "./constants/addresses.js";

// ── Crypto (ECIES payload encryption) ────────────
export {
  generateKeypair,
  publicKeyFromPrivate,
  encryptBlob,
  decryptBlob,
  encryptBundle,
  decryptBundleAt,
  parseBundle,
  encryptHybrid,
  decryptHybridAt,
  looksLikeHybrid,
  hybridOverhead,
  maxInlineMessageBytes,
  bytesToHex,
  hexToBytes,
  BUNDLE_VERSION,
  HYBRID_VERSION,
  IV_LENGTH,
  TAG_LENGTH,
  UNCOMPRESSED_PUBKEY_LENGTH,
  COMPRESSED_PUBKEY_LENGTH,
  PRIVATE_KEY_LENGTH,
  AES_KEY_LENGTH,
  MAX_BLOB_LENGTH,
  MAX_RECIPIENT_COUNT,
} from "./crypto/ecies.js";
export type { Keypair, BytesInput } from "./crypto/ecies.js";
export {
  deriveReadingKeyFromSeed,
  deriveReadingKeyFromPrivateKey,
  deriveReadingKeyFromPrfOutput,
  deriveReadingKeyFromSecret,
  prfSalt,
  LOCALKEY_EXTRACT_SALT,
  LOCALKEY_EXTRACT_INFO,
  RAWKEY_EXTRACT_INFO,
  READING_SCALAR_INFO,
  PRF_SALT_PREIMAGE,
} from "./crypto/reading-key.js";

// ── Errors ──────────────────────────────────────
export {
  MaktubError,
  SignerRequiredError,
  UnsupportedNetworkError,
  HeartbeatNotFoundError,
  ContractRevertError,
  NetworkDetectionError,
  FlashNotAvailableError,
} from "./errors/index.js";

// ── Veil (time-confidential Beats — PREVIEW) ──────────────────────────────────
export {
  veilSeal,
  veilOpen,
  veilUnwrap,
  combinePartials,
  conditionIdentity,
  beatExecutedCondition,
  VEIL_CHAIN_ID,
  VEIL_PREVIEW,
} from "./veil/veil.js";
