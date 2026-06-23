/**
 * Write operations mixin for {@link ExecutorRewardsContract}.
 *
 * @module
 */

import type { ContractTransactionResponse } from "ethers";
import type { ExecutorRewardsConstructor } from "./base.js";

export interface IExecutorRewardsWriteOps {
  stake(amount: bigint): Promise<ContractTransactionResponse>;
  unstake(amount: bigint): Promise<ContractTransactionResponse>;
}

export function ExecutorRewardsWriteOps<TBase extends ExecutorRewardsConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => IExecutorRewardsWriteOps) {
  return class extends Base implements IExecutorRewardsWriteOps {
    // ──────────────────────────────────────────────
    //  Write Functions
    // ──────────────────────────────────────────────

    /**
     * Stake MKTB tokens to become an active executor.
     * Caller must have approved this contract to transfer the MKTB amount.
     *
     * @param amount - The amount of MKTB to stake (in wei).
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async stake(amount: bigint): Promise<ContractTransactionResponse> {
      this._requireSigner("stake");
      return this.contract.getFunction("stake")(amount) as Promise<ContractTransactionResponse>;
    }

    /**
     * Unstake MKTB tokens. If the remaining stake drops below the minimum,
     * the executor becomes inactive.
     *
     * @param amount - The amount of MKTB to withdraw (in wei).
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async unstake(amount: bigint): Promise<ContractTransactionResponse> {
      this._requireSigner("unstake");
      return this.contract.getFunction("unstake")(amount) as Promise<ContractTransactionResponse>;
    }
  };
}
