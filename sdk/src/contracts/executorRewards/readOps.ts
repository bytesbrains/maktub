/**
 * Read operations mixin for {@link ExecutorRewardsContract}.
 *
 * @module
 */

import type { ExecutorInfo, EmissionInfo } from "../../types/index.js";
import type { ExecutorRewardsConstructor } from "./base.js";

export interface IExecutorRewardsReadOps {
  getStake(executor: string): Promise<bigint>;
  isActiveExecutor(account: string): Promise<boolean>;
  getRewardsEarned(executor: string): Promise<bigint>;
  getExecutorInfo(executor: string): Promise<ExecutorInfo>;
  getEmissionInfo(): Promise<EmissionInfo>;
  currentRewardAmount(): Promise<bigint>;
  yearlyEmission(year: number): Promise<bigint>;
  minimumStake(): Promise<bigint>;
  totalStaked(): Promise<bigint>;
}

export function ExecutorRewardsReadOps<TBase extends ExecutorRewardsConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => IExecutorRewardsReadOps) {
  return class extends Base implements IExecutorRewardsReadOps {
    // ──────────────────────────────────────────────
    //  Read Functions
    // ──────────────────────────────────────────────

    /**
     * Get the stake balance of an executor.
     *
     * @param executor - The executor address.
     * @returns The staked amount in wei.
     */
    async getStake(executor: string): Promise<bigint> {
      return this.contract.getFunction("stakes")(executor) as Promise<bigint>;
    }

    /**
     * Check whether an executor is actively staked (meets minimum stake).
     *
     * @param account - The address to check.
     * @returns True if the executor is active.
     */
    async isActiveExecutor(account: string): Promise<boolean> {
      return this.contract.getFunction("isActiveExecutor")(account) as Promise<boolean>;
    }

    /**
     * Get the total rewards earned by an executor.
     *
     * @param executor - The executor address.
     * @returns The total rewards in MKTB wei.
     */
    async getRewardsEarned(executor: string): Promise<bigint> {
      return this.contract.getFunction("rewardsEarned")(executor) as Promise<bigint>;
    }

    /**
     * Get aggregated executor information for an address.
     *
     * @param executor - The executor address.
     * @returns The executor's staking and reward info.
     */
    async getExecutorInfo(executor: string): Promise<ExecutorInfo> {
      const [stakeAmount, isActive, rewards] = await Promise.all([
        this.getStake(executor),
        this.isActiveExecutor(executor),
        this.getRewardsEarned(executor),
      ]);

      return {
        stakeAmount,
        isActive,
        rewardsEarned: rewards,
      };
    }

    /**
     * Get the current emission schedule information.
     *
     * @returns Aggregated emission and staking data.
     */
    async getEmissionInfo(): Promise<EmissionInfo> {
      const [
        currentYear,
        rewardPerExecution,
        totalDistributed,
        remainingPool,
        totalStaked,
        minimumStake,
        paused,
      ] = await Promise.all([
        this.contract.getFunction("currentYear")() as Promise<bigint>,
        this.contract.getFunction("rewardPerExecution")() as Promise<bigint>,
        this.contract.getFunction("totalDistributed")() as Promise<bigint>,
        this.contract.getFunction("remainingRewardPool")() as Promise<bigint>,
        this.contract.getFunction("totalStaked")() as Promise<bigint>,
        this.contract.getFunction("minimumStake")() as Promise<bigint>,
        this.contract.getFunction("paused")() as Promise<boolean>,
      ]);

      return {
        currentYear,
        rewardPerExecution,
        totalDistributed,
        remainingPool,
        totalStaked,
        minimumStake,
        paused,
      };
    }

    /**
     * Get the current per-execution reward amount.
     *
     * @returns The reward amount in MKTB wei.
     */
    async currentRewardAmount(): Promise<bigint> {
      return this.contract.getFunction("currentRewardAmount")() as Promise<bigint>;
    }

    /**
     * Get the emission allocation for a specific halving year.
     *
     * @param year - The year index (0-based, 0-9).
     * @returns The yearly emission in MKTB wei.
     */
    async yearlyEmission(year: number): Promise<bigint> {
      return this.contract.getFunction("yearlyEmission")(year) as Promise<bigint>;
    }

    /**
     * Get the minimum stake required to be an active executor.
     *
     * @returns The minimum stake in MKTB wei.
     */
    async minimumStake(): Promise<bigint> {
      return this.contract.getFunction("minimumStake")() as Promise<bigint>;
    }

    /**
     * Get the total MKTB currently staked across all executors.
     *
     * @returns The total staked amount in wei.
     */
    async totalStaked(): Promise<bigint> {
      return this.contract.getFunction("totalStaked")() as Promise<bigint>;
    }
  };
}
