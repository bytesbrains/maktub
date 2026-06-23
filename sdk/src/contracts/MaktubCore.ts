/**
 * Typed wrapper for the MaktubCore contract.
 *
 * MaktubCore is the immutable heartbeat engine of the Maktub Protocol.
 * It manages heartbeat CRUD, timer enforcement, and execution triggers.
 *
 * @module
 */

import { type Provider, type Signer } from "ethers";
import { MaktubCoreContractBase } from "./maktubCore/base.js";
import { MaktubCoreWriteOps } from "./maktubCore/writeOps.js";
import { MaktubCoreReadOps } from "./maktubCore/readOps.js";

/**
 * Typed wrapper around the MaktubCore smart contract.
 *
 * Provides methods for creating heartbeats, checking in, executing expired
 * heartbeats, and querying heartbeat state.
 */
export class MaktubCoreContract extends MaktubCoreReadOps(
  MaktubCoreWriteOps(MaktubCoreContractBase)
) {
  /**
   * Create a new MaktubCoreContract wrapper.
   * @param address - The deployed MaktubCore contract address.
   * @param provider - An ethers v6 Provider for read calls.
   * @param signer - An optional ethers v6 Signer for write transactions.
   */
  constructor(address: string, provider: Provider, signer?: Signer) {
    super(address, provider, signer);
  }
}
