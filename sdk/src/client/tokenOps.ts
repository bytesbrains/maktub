/**
 * Token operations mixin (MktbToken) for {@link MaktubClient}.
 *
 * @module
 */

import type { ContractTransactionResponse } from "ethers";
import type { TokenInfo } from "../types/index.js";
import type { MaktubClientConstructor } from "./base.js";

export interface ITokenOps {
  balanceOf(account: string): Promise<bigint>;
  approve(spender: string, amount: bigint): Promise<ContractTransactionResponse>;
  delegateVotes(delegatee: string): Promise<ContractTransactionResponse>;
  getTokenInfo(): Promise<TokenInfo>;
}

export function TokenOps<TBase extends MaktubClientConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => ITokenOps) {
  return class extends Base {
    // ──────────────────────────────────────────────
    //  Token Operations (MktbToken)
    // ──────────────────────────────────────────────

    /**
     * Get the MKTB balance of an address.
     *
     * @param account - The address to check.
     * @returns The balance in MKTB wei.
     */
    async balanceOf(account: string): Promise<bigint> {
      await this._ensureInit();
      return this.token.balanceOf(account);
    }

    /**
     * Approve MKTB spending by another address.
     *
     * @param spender - The address to approve.
     * @param amount - The allowance in wei.
     * @returns The transaction response.
     */
    async approve(spender: string, amount: bigint): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.token.approve(spender, amount);
    }

    /**
     * Delegate voting power to an address.
     *
     * @param delegatee - The address to delegate to.
     * @returns The transaction response.
     */
    async delegateVotes(delegatee: string): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.token.delegate(delegatee);
    }

    /**
     * Get token metadata and supply info.
     *
     * @returns The token info.
     */
    async getTokenInfo(): Promise<TokenInfo> {
      await this._ensureInit();
      return this.token.getTokenInfo();
    }
  };
}
