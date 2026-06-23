/**
 * Typed wrapper for the ExecutorRewards contract.
 *
 * ExecutorRewards manages executor staking and MKTB emission distribution.
 * Executors stake MKTB to participate in heartbeat execution and earn
 * rewards from a 35M MKTB pool over a 10-year halving schedule.
 *
 * @module
 */

import { type Provider, type Signer } from "ethers";
import { ExecutorRewardsContractBase } from "./executorRewards/base.js";
import { ExecutorRewardsWriteOps } from "./executorRewards/writeOps.js";
import { ExecutorRewardsReadOps } from "./executorRewards/readOps.js";

/**
 * Typed wrapper around the ExecutorRewards smart contract.
 */
export class ExecutorRewardsContract extends ExecutorRewardsReadOps(
  ExecutorRewardsWriteOps(ExecutorRewardsContractBase)
) {
  /**
   * Create a new ExecutorRewardsContract wrapper.
   * @param address - The deployed ExecutorRewards contract address.
   * @param provider - An ethers v6 Provider for read calls.
   * @param signer - An optional ethers v6 Signer for write transactions.
   */
  constructor(address: string, provider: Provider, signer?: Signer) {
    super(address, provider, signer);
  }
}
