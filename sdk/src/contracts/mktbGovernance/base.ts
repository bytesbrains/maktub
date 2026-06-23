/**
 * Mixin base for {@link MktbGovernanceContract}.
 *
 * Holds the underlying ethers Contract, the signer state, the constructor,
 * and the protected signer guard the per-concern mixins build on. See
 * `src/contracts/MktbGovernance.ts` for the public composition.
 *
 * @module
 */

import { Contract, type Provider, type Signer } from "ethers";
import { MKTB_GOVERNANCE_ABI } from "../../constants/abis.js";
import { SignerRequiredError } from "../../errors/index.js";

export class MktbGovernanceContractBase {
  /** The underlying ethers Contract instance. */
  public readonly contract: Contract;

  private readonly _signer: Signer | undefined;

  /**
   * Create a new MktbGovernanceContract wrapper.
   * @param address - The deployed MktbGovernance contract address.
   * @param provider - An ethers v6 Provider for read calls.
   * @param signer - An optional ethers v6 Signer for write transactions.
   */
  constructor(address: string, provider: Provider, signer?: Signer) {
    this._signer = signer;
    this.contract = new Contract(address, MKTB_GOVERNANCE_ABI, signer ?? provider);
  }

  /** Ensure a signer is available for write operations. */
  protected _requireSigner(method: string): void {
    if (!this._signer) {
      throw new SignerRequiredError(method);
    }
  }
}

export type MktbGovernanceConstructor = new (...args: any[]) => MktbGovernanceContractBase;
