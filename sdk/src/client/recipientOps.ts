/**
 * Recipient operations mixin (RecipientRegistry) for {@link MaktubClient}.
 *
 * @module
 */

import type { ContractTransactionResponse } from "ethers";
import type { MaktubClientConstructor } from "./base.js";

export interface IRecipientOps {
  registerRecipient(
    prePublicKey: string | Uint8Array
  ): Promise<ContractTransactionResponse>;
  updatePrePublicKey(
    newPrePublicKey: string | Uint8Array
  ): Promise<ContractTransactionResponse>;
  isRecipientRegistered(account: string): Promise<boolean>;
  getPrePublicKey(account: string): Promise<string>;
}

export function RecipientOps<TBase extends MaktubClientConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => IRecipientOps) {
  return class extends Base {
    // ──────────────────────────────────────────────
    //  Recipient Operations (RecipientRegistry)
    // ──────────────────────────────────────────────

    /**
     * Register the caller as a recipient with a PRE public key.
     * Free (gas only). Cannot register twice.
     *
     * @param prePublicKey - The PRE public key (hex string or Uint8Array).
     * @returns The transaction response.
     */
    async registerRecipient(
      prePublicKey: string | Uint8Array
    ): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.registry.register(prePublicKey);
    }

    /**
     * Update the caller's PRE public key. Must already be registered.
     *
     * @param newPrePublicKey - The new PRE public key.
     * @returns The transaction response.
     */
    async updatePrePublicKey(
      newPrePublicKey: string | Uint8Array
    ): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.registry.updatePrePublicKey(newPrePublicKey);
    }

    /**
     * Check whether an address is registered as a recipient.
     *
     * @param account - The address to check.
     * @returns True if registered.
     */
    async isRecipientRegistered(account: string): Promise<boolean> {
      await this._ensureInit();
      return this.registry.isRegistered(account);
    }

    /**
     * Get the PRE public key of a registered recipient.
     *
     * @param account - The recipient address.
     * @returns The PRE public key as hex bytes.
     */
    async getPrePublicKey(account: string): Promise<string> {
      await this._ensureInit();
      return this.registry.getPrePublicKey(account);
    }
  };
}
