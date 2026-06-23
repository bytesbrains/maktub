/**
 * High-level client for the Maktub Protocol.
 *
 * Wraps all five v3 contracts behind a single, ergonomic API surface.
 * Handles network detection, address resolution, and signer management.
 *
 * @example
 * ```typescript
 * import { MaktubClient } from "@bytesbrains/maktub-sdk";
 * import { BrowserProvider } from "ethers";
 *
 * const browserProvider = new BrowserProvider(window.ethereum);
 * const signer = await browserProvider.getSigner();
 *
 * const maktub = new MaktubClient({
 *   provider: browserProvider,
 *   signer,
 * });
 *
 * // Create a heartbeat with 180-day interval. The ID is deterministic
 * // (keccak256(sender, salt)); omit `salt` for a random one (returned to you).
 * const { heartbeatId, salt } = await maktub.createHeartbeat({
 *   recipients: ["0x..."],
 *   payload: "0x...", // IPFS CID as bytes
 *   interval: 180 * 24 * 3600,
 * });
 *
 * // Check in to reset the timer
 * await maktub.checkIn(heartbeatId);
 * ```
 *
 * @module
 */

import type { MaktubClientConfig } from "./types/index.js";
import { MaktubClientBase } from "./client/base.js";
import { HeartbeatOps } from "./client/heartbeatOps.js";
import { RecipientOps } from "./client/recipientOps.js";
import { ExecutorOps } from "./client/executorOps.js";
import { TokenOps } from "./client/tokenOps.js";
import { GovernanceOps } from "./client/governanceOps.js";
import { CryptoOps } from "./client/cryptoOps.js";
import { FlashOps } from "./client/flashOps.js";

/**
 * The main entry point for interacting with the Maktub Protocol.
 *
 * Provides a high-level API that wraps all five v3 contracts:
 * - MaktubCore: Heartbeat CRUD, timer, execution
 * - RecipientRegistry: Recipient registration, PRE keys
 * - MktbToken: ERC-20 governance token
 * - ExecutorRewards: Staking and emission distribution
 * - MktbGovernance: Protocol governance
 */
export class MaktubClient extends FlashOps(
  CryptoOps(
    GovernanceOps(
      TokenOps(ExecutorOps(RecipientOps(HeartbeatOps(MaktubClientBase))))
    )
  )
) {
  /**
   * Create a new MaktubClient.
   *
   * @param config - The client configuration with provider, optional signer, and optional addresses.
   */
  constructor(config: MaktubClientConfig) {
    super(config);
  }
}
