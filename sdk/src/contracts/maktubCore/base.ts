/**
 * Mixin base for {@link MaktubCoreContract}.
 *
 * Holds the underlying ethers Contract, the provider/signer state, the
 * constructor, and the protected signer guard the per-concern mixins build on.
 * See `src/contracts/MaktubCore.ts` for the public composition.
 *
 * @module
 */

import { Contract, type Provider, type Signer } from "ethers";
import { MAKTUB_CORE_ABI } from "../../constants/abis.js";
import { SignerRequiredError } from "../../errors/index.js";

export class MaktubCoreContractBase {
  /** The underlying ethers Contract instance. */
  public readonly contract: Contract;

  private readonly _provider: Provider;
  private readonly _signer: Signer | undefined;

  /**
   * Create a new MaktubCoreContract wrapper.
   * @param address - The deployed MaktubCore contract address.
   * @param provider - An ethers v6 Provider for read calls.
   * @param signer - An optional ethers v6 Signer for write transactions.
   */
  constructor(address: string, provider: Provider, signer?: Signer) {
    this._provider = provider;
    this._signer = signer;
    this.contract = new Contract(address, MAKTUB_CORE_ABI, signer ?? provider);
  }

  /** Ensure a signer is available for write operations. */
  protected _requireSigner(method: string): void {
    if (!this._signer) {
      throw new SignerRequiredError(method);
    }
  }
}

export type MaktubCoreConstructor = new (...args: any[]) => MaktubCoreContractBase;
