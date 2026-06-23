/**
 * Executor & staking operations mixin (ExecutorRewards) for {@link MaktubClient}.
 *
 * @module
 */

import type { ContractTransactionResponse } from "ethers";
import type { ExecutorInfo, EmissionInfo } from "../types/index.js";
import type { MaktubClientConstructor } from "./base.js";

export interface IExecutorOps {
  stakeForExecution(amount: bigint): Promise<ContractTransactionResponse>;
  unstake(amount: bigint): Promise<ContractTransactionResponse>;
  isActiveExecutor(account: string): Promise<boolean>;
  getExecutorInfo(executor: string): Promise<ExecutorInfo>;
  getEmissionInfo(): Promise<EmissionInfo>;
}

export function ExecutorOps<TBase extends MaktubClientConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => IExecutorOps) {
  return class extends Base {
    // ──────────────────────────────────────────────
    //  Executor & Staking (ExecutorRewards)
    // ──────────────────────────────────────────────

    /**
     * Stake MKTB tokens to become an active executor.
     * Caller must have approved the ExecutorRewards contract first.
     *
     * @param amount - MKTB amount to stake (in wei).
     * @returns The transaction response.
     */
    async stakeForExecution(amount: bigint): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.rewards.stake(amount);
    }

    /**
     * Unstake MKTB tokens. May deactivate executor status if below minimum.
     *
     * @param amount - MKTB amount to unstake (in wei).
     * @returns The transaction response.
     */
    async unstake(amount: bigint): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.rewards.unstake(amount);
    }

    /**
     * Check whether an address is an active executor.
     *
     * @param account - The address to check.
     * @returns True if the address is an active executor.
     */
    async isActiveExecutor(account: string): Promise<boolean> {
      await this._ensureInit();
      return this.rewards.isActiveExecutor(account);
    }

    /**
     * Get executor staking and reward info for an address.
     *
     * @param executor - The executor address.
     * @returns The executor info.
     */
    async getExecutorInfo(executor: string): Promise<ExecutorInfo> {
      await this._ensureInit();
      return this.rewards.getExecutorInfo(executor);
    }

    /**
     * Get the current emission schedule information.
     *
     * @returns Emission and staking aggregate data.
     */
    async getEmissionInfo(): Promise<EmissionInfo> {
      await this._ensureInit();
      return this.rewards.getEmissionInfo();
    }
  };
}
