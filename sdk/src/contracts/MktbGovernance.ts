/**
 * Typed wrapper for the MktbGovernance contract.
 *
 * MktbGovernance is an OpenZeppelin Governor that governs upgradeable
 * periphery contracts (ExecutorRewards, future modules) while the immutable
 * core remains untouchable. Proposals execute through a TimelockController.
 *
 * @module
 */

import { type Provider, type Signer } from "ethers";
import { MktbGovernanceContractBase } from "./mktbGovernance/base.js";
import { MktbGovernanceWriteOps } from "./mktbGovernance/writeOps.js";
import { MktbGovernanceReadOps } from "./mktbGovernance/readOps.js";

/**
 * Typed wrapper around the MktbGovernance smart contract.
 */
export class MktbGovernanceContract extends MktbGovernanceReadOps(
  MktbGovernanceWriteOps(MktbGovernanceContractBase)
) {
  /**
   * Create a new MktbGovernanceContract wrapper.
   * @param address - The deployed MktbGovernance contract address.
   * @param provider - An ethers v6 Provider for read calls.
   * @param signer - An optional ethers v6 Signer for write transactions.
   */
  constructor(address: string, provider: Provider, signer?: Signer) {
    super(address, provider, signer);
  }
}
