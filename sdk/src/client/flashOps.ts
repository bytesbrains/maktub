/**
 * Flash operations mixin (MaktubFlash + RecipientRegistryV2) for {@link MaktubClient}.
 *
 * @module
 */

import type { ContractTransactionResponse, BytesLike } from "ethers";
import type { FlashInfo, SendFlashResult } from "../types/index.js";
import type { MaktubClientConstructor } from "./base.js";

export interface IFlashOps {
  flash(recipients: string[], payload: BytesLike): Promise<SendFlashResult>;
  flashFeeFor(recipientCount?: number): Promise<bigint>;
  getFlash(id: bigint | number): Promise<FlashInfo>;
  getSentFlashes(sender: string): Promise<bigint[]>;
  getReceivedFlashes(recipient: string): Promise<bigint[]>;
  isFlashEligible(account: string): Promise<boolean>;
  registerV2(
    encPubKey: string | Uint8Array,
    ratchetPubKey?: string | Uint8Array
  ): Promise<ContractTransactionResponse>;
  enableFlash(
    ratchetPubKey: string | Uint8Array
  ): Promise<ContractTransactionResponse>;
  disableFlash(): Promise<ContractTransactionResponse>;
}

export function FlashOps<TBase extends MaktubClientConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => IFlashOps) {
  return class extends Base {
    // ──────────────────────────────────────────────
    //  Flash Operations (MaktubFlash + RecipientRegistryV2)
    // ──────────────────────────────────────────────

    /**
     * Send a flash: instant, fire-and-forget delivery of an encrypted payload.
     *
     * All recipients must be Flash-eligible (ratchet key registered on
     * RecipientRegistryV2 — check with {@link isFlashEligible}). The exact
     * linear fee (`recipients.length * perRecipientFee`) is computed on-chain
     * and attached automatically.
     *
     * @param recipients - Recipient addresses (1 to 25).
     * @param payload - The encrypted envelope bytes.
     * @returns The transaction, receipt, flash ID, and fee paid.
     * @throws {FlashNotAvailableError} If the network has no Flash deployment.
     */
    async flash(recipients: string[], payload: BytesLike): Promise<SendFlashResult> {
      await this._ensureInit();
      return this._requireFlash().flash(recipients, payload);
    }

    /**
     * The exact fee in wei for a flash with the given recipient count.
     *
     * @param recipientCount - The number of recipients (defaults to 1).
     * @throws {FlashNotAvailableError} If the network has no Flash deployment.
     */
    async flashFeeFor(recipientCount: number = 1): Promise<bigint> {
      await this._ensureInit();
      return this._requireFlash().flashFeeFor(recipientCount);
    }

    /**
     * Retrieve the canonical on-chain record for a flash (D-039), enabling a
     * late reader to fetch sender/recipients/payload/timestamp directly.
     *
     * @param id - The flash ID.
     * @throws {FlashNotAvailableError} If the network has no Flash deployment.
     */
    async getFlash(id: bigint | number): Promise<FlashInfo> {
      await this._ensureInit();
      return this._requireFlash().getFlash(id);
    }

    /**
     * All flash IDs sent by `sender` (send order; newest last).
     *
     * @param sender - The sender address.
     * @throws {FlashNotAvailableError} If the network has no Flash deployment.
     */
    async getSentFlashes(sender: string): Promise<bigint[]> {
      await this._ensureInit();
      return this._requireFlash().getSentFlashes(sender);
    }

    /**
     * All flash IDs received by `recipient` (exact).
     *
     * @param recipient - The recipient address.
     * @throws {FlashNotAvailableError} If the network has no Flash deployment.
     */
    async getReceivedFlashes(recipient: string): Promise<bigint[]> {
      await this._ensureInit();
      return this._requireFlash().getReceivedFlashes(recipient);
    }

    /**
     * Whether an address can receive flashes (has opted in by registering a
     * ratchet public key on RecipientRegistryV2).
     *
     * @param account - The address to check.
     * @throws {FlashNotAvailableError} If the network has no V2 registry.
     */
    async isFlashEligible(account: string): Promise<boolean> {
      await this._ensureInit();
      return this._requireRegistryV2().isFlashEligible(account);
    }

    /**
     * Register the caller on RecipientRegistryV2 with typed key slots.
     * Registering a ratchet key is the Flash opt-in; omit it (or pass "0x")
     * to register Beat-only.
     *
     * @param encPubKey - ECIES public key (33 or 65 bytes).
     * @param ratchetPubKey - Ratchet public key, or "0x" for Beat-only.
     * @throws {FlashNotAvailableError} If the network has no V2 registry.
     */
    async registerV2(
      encPubKey: string | Uint8Array,
      ratchetPubKey: string | Uint8Array = "0x"
    ): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this._requireRegistryV2().register(encPubKey, ratchetPubKey);
    }

    /**
     * Opt in to (or rotate the key for) receiving flashes.
     *
     * @param ratchetPubKey - The new ratchet public key (33 or 65 bytes).
     * @throws {FlashNotAvailableError} If the network has no V2 registry.
     */
    async enableFlash(ratchetPubKey: string | Uint8Array): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this._requireRegistryV2().setRatchetPubKey(ratchetPubKey);
    }

    /**
     * Opt OUT of receiving flashes (compromise remediation): clears the
     * caller's ratchet key so senders fail loud instead of encrypting to a
     * compromised key. Beats are unaffected.
     *
     * @throws {FlashNotAvailableError} If the network has no V2 registry.
     */
    async disableFlash(): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this._requireRegistryV2().setRatchetPubKey("0x");
    }
  };
}
