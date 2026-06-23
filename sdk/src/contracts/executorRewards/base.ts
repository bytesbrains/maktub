/**
 * Mixin base for {@link ExecutorRewardsContract}.
 *
 * Holds the underlying ethers Contract, the signer state, the constructor,
 * and the protected signer guard the per-concern mixins build on. See
 * `src/contracts/ExecutorRewards.ts` for the public composition.
 *
 * @module
 */

import { Contract, type Provider, type Signer } from "ethers";
import { EXECUTOR_REWARDS_ABI } from "../../constants/abis.js";
import { SignerRequiredError } from "../../errors/index.js";

export class ExecutorRewardsContractBase {
  /** The underlying ethers Contract instance. */
  public readonly contract: Contract;

  private readonly _signer: Signer | undefined;

  /**
   * Create a new ExecutorRewardsContract wrapper.
   * @param address - The deployed ExecutorRewards contract address.
   * @param provider - An ethers v6 Provider for read calls.
   * @param signer - An optional ethers v6 Signer for write transactions.
   */
  constructor(address: string, provider: Provider, signer?: Signer) {
    this._signer = signer;
    this.contract = new Contract(address, EXECUTOR_REWARDS_ABI, signer ?? provider);
  }

  /** Ensure a signer is available for write operations. */
  protected _requireSigner(method: string): void {
    if (!this._signer) {
      throw new SignerRequiredError(method);
    }
  }
}

export type ExecutorRewardsConstructor = new (...args: any[]) => ExecutorRewardsContractBase;
