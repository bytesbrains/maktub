/**
 * Typed wrapper for the MktbToken contract.
 *
 * MktbToken is the MKTB governance token — an ERC-20 with voting power
 * delegation (ERC20Votes), gasless approvals (ERC20Permit), and burn capability.
 *
 * @module
 */

import {
  Contract,
  type ContractTransactionResponse,
  type Provider,
  type Signer,
} from "ethers";
import { MKTB_TOKEN_ABI } from "../constants/abis.js";
import type { TokenInfo } from "../types/index.js";
import { SignerRequiredError } from "../errors/index.js";

/**
 * Typed wrapper around the MktbToken smart contract.
 */
export class MktbTokenContract {
  /** The underlying ethers Contract instance. */
  public readonly contract: Contract;

  private readonly _signer: Signer | undefined;

  /**
   * Create a new MktbTokenContract wrapper.
   * @param address - The deployed MktbToken contract address.
   * @param provider - An ethers v6 Provider for read calls.
   * @param signer - An optional ethers v6 Signer for write transactions.
   */
  constructor(address: string, provider: Provider, signer?: Signer) {
    this._signer = signer;
    this.contract = new Contract(address, MKTB_TOKEN_ABI, signer ?? provider);
  }

  // ──────────────────────────────────────────────
  //  Write Functions
  // ──────────────────────────────────────────────

  /**
   * Transfer MKTB tokens to a recipient.
   *
   * @param to - The recipient address.
   * @param amount - The amount of MKTB to transfer (in wei, 18 decimals).
   * @returns The transaction response.
   * @throws {SignerRequiredError} If no signer is configured.
   */
  async transfer(to: string, amount: bigint): Promise<ContractTransactionResponse> {
    this._requireSigner("transfer");
    return this.contract.getFunction("transfer")(to, amount) as Promise<ContractTransactionResponse>;
  }

  /**
   * Approve a spender to transfer MKTB tokens on the caller's behalf.
   *
   * @param spender - The address to approve.
   * @param amount - The allowance amount in wei.
   * @returns The transaction response.
   * @throws {SignerRequiredError} If no signer is configured.
   */
  async approve(spender: string, amount: bigint): Promise<ContractTransactionResponse> {
    this._requireSigner("approve");
    return this.contract.getFunction("approve")(spender, amount) as Promise<ContractTransactionResponse>;
  }

  /**
   * Delegate voting power to an address. Token holders must delegate
   * (to themselves or another) to activate voting power checkpoints.
   *
   * @param delegatee - The address to delegate voting power to.
   * @returns The transaction response.
   * @throws {SignerRequiredError} If no signer is configured.
   */
  async delegate(delegatee: string): Promise<ContractTransactionResponse> {
    this._requireSigner("delegate");
    return this.contract.getFunction("delegate")(delegatee) as Promise<ContractTransactionResponse>;
  }

  /**
   * Burn MKTB tokens from the caller's balance.
   *
   * @param amount - The amount to burn in wei.
   * @returns The transaction response.
   * @throws {SignerRequiredError} If no signer is configured.
   */
  async burn(amount: bigint): Promise<ContractTransactionResponse> {
    this._requireSigner("burn");
    return this.contract.getFunction("burn")(amount) as Promise<ContractTransactionResponse>;
  }

  // ──────────────────────────────────────────────
  //  Read Functions
  // ──────────────────────────────────────────────

  /**
   * Get the MKTB balance of an address.
   *
   * @param account - The address to check.
   * @returns The balance in wei.
   */
  async balanceOf(account: string): Promise<bigint> {
    return this.contract.getFunction("balanceOf")(account) as Promise<bigint>;
  }

  /**
   * Get the allowance granted by an owner to a spender.
   *
   * @param owner - The token owner address.
   * @param spender - The spender address.
   * @returns The allowance in wei.
   */
  async allowance(owner: string, spender: string): Promise<bigint> {
    return this.contract.getFunction("allowance")(owner, spender) as Promise<bigint>;
  }

  /**
   * Get the current voting power of an address.
   *
   * @param account - The address to check.
   * @returns The current voting power.
   */
  async getVotes(account: string): Promise<bigint> {
    return this.contract.getFunction("getVotes")(account) as Promise<bigint>;
  }

  /**
   * Get the delegate address for an account.
   *
   * @param account - The delegator address.
   * @returns The delegate address.
   */
  async delegates(account: string): Promise<string> {
    return this.contract.getFunction("delegates")(account) as Promise<string>;
  }

  /**
   * Get aggregated token information.
   *
   * @returns Token metadata and supply info.
   */
  async getTokenInfo(): Promise<TokenInfo> {
    const [name, symbol, decimals, totalSupply, maxSupply] = await Promise.all([
      this.contract.getFunction("name")() as Promise<string>,
      this.contract.getFunction("symbol")() as Promise<string>,
      this.contract.getFunction("decimals")() as Promise<bigint>,
      this.contract.getFunction("totalSupply")() as Promise<bigint>,
      this.contract.getFunction("MAX_SUPPLY")() as Promise<bigint>,
    ]);

    return {
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply,
      maxSupply,
    };
  }

  /**
   * Get the total supply of MKTB tokens.
   *
   * @returns The total supply in wei.
   */
  async totalSupply(): Promise<bigint> {
    return this.contract.getFunction("totalSupply")() as Promise<bigint>;
  }

  // ──────────────────────────────────────────────
  //  Internal Helpers
  // ──────────────────────────────────────────────

  /** Ensure a signer is available for write operations. */
  private _requireSigner(method: string): void {
    if (!this._signer) {
      throw new SignerRequiredError(method);
    }
  }
}
