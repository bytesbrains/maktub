/**
 * Typed wrapper for the RecipientRegistryV2 contract.
 *
 * RecipientRegistryV2 is the immutable typed-key-slot registry that serves
 * Maktub Flash (D-023 schema): a long-lived ECIES `encPubKey` (length- and
 * prefix-validated), a `ratchetPubKey` whose presence is the Flash opt-in,
 * and namespaced extension keys for future key types. It falls through to
 * RecipientRegistry v1 for Beat-only recipients.
 *
 * @module
 */

import {
  Contract,
  type ContractTransactionResponse,
  type Provider,
  type Signer,
} from "ethers";
import { RECIPIENT_REGISTRY_V2_ABI } from "../constants/abis.js";
import { SignerRequiredError } from "../errors/index.js";
import type { RecipientV2Record } from "../types/index.js";

/**
 * Typed wrapper around the RecipientRegistryV2 smart contract.
 */
export class RecipientRegistryV2Contract {
  /** The underlying ethers Contract instance. */
  public readonly contract: Contract;

  private readonly _signer: Signer | undefined;

  /**
   * Create a new RecipientRegistryV2Contract wrapper.
   * @param address - The deployed RecipientRegistryV2 contract address.
   * @param provider - An ethers v6 Provider for read calls.
   * @param signer - An optional ethers v6 Signer for write transactions.
   */
  constructor(address: string, provider: Provider, signer?: Signer) {
    this._signer = signer;
    this.contract = new Contract(address, RECIPIENT_REGISTRY_V2_ABI, signer ?? provider);
  }

  // ──────────────────────────────────────────────
  //  Write Functions
  // ──────────────────────────────────────────────

  /**
   * Register the caller with typed key slots. Cannot register twice —
   * use the per-slot setters to rotate keys afterwards.
   *
   * @param encPubKey - ECIES public key, 33 or 65 bytes (0x02/0x03 or 0x04 prefix).
   * @param ratchetPubKey - Ratchet public key (the Flash opt-in), or "0x" /
   *                        empty bytes to register Beat-only.
   * @returns The transaction response.
   * @throws {SignerRequiredError} If no signer is configured.
   */
  async register(
    encPubKey: string | Uint8Array,
    ratchetPubKey: string | Uint8Array = "0x"
  ): Promise<ContractTransactionResponse> {
    this._requireSigner("register");
    return this.contract.getFunction("register")(encPubKey, ratchetPubKey) as Promise<ContractTransactionResponse>;
  }

  /**
   * Rotate the caller's ECIES public key. Live Beats referencing the old
   * key are NOT re-encrypted — their owners must update recipients with a
   * fresh envelope (apps watch `EncPubKeyUpdated` to drive that flow).
   *
   * @param newEncPubKey - The new ECIES public key (33 or 65 bytes).
   * @returns The transaction response.
   * @throws {SignerRequiredError} If no signer is configured.
   */
  async setEncPubKey(newEncPubKey: string | Uint8Array): Promise<ContractTransactionResponse> {
    this._requireSigner("setEncPubKey");
    return this.contract.getFunction("setEncPubKey")(newEncPubKey) as Promise<ContractTransactionResponse>;
  }

  /**
   * Register, rotate, or clear the caller's ratchet public key.
   *
   * Passing a key is the Flash opt-IN. Passing "0x" clears it — the Flash
   * opt-OUT: senders fail loud (`RecipientNotFlashEligible`) instead of
   * encrypting to a potentially compromised key.
   *
   * @param newRatchetPubKey - The new ratchet public key (33 or 65 bytes),
   *                           or "0x" to opt out of Flash.
   * @returns The transaction response.
   * @throws {SignerRequiredError} If no signer is configured.
   */
  async setRatchetPubKey(newRatchetPubKey: string | Uint8Array): Promise<ContractTransactionResponse> {
    this._requireSigner("setRatchetPubKey");
    return this.contract.getFunction("setRatchetPubKey")(newRatchetPubKey) as Promise<ContractTransactionResponse>;
  }

  /**
   * Register, rotate, or delete a namespaced extension key.
   *
   * @param keyType - Namespaced type, e.g. keccak256("maktub.keytype.v1.<name>").
   * @param key - The key material, or "0x" to delete (revocation).
   * @returns The transaction response.
   * @throws {SignerRequiredError} If no signer is configured.
   */
  async setExtKey(
    keyType: string,
    key: string | Uint8Array
  ): Promise<ContractTransactionResponse> {
    this._requireSigner("setExtKey");
    return this.contract.getFunction("setExtKey")(keyType, key) as Promise<ContractTransactionResponse>;
  }

  // ──────────────────────────────────────────────
  //  Read Functions
  // ──────────────────────────────────────────────

  /**
   * Whether an address is registered on v2 OR on the v1 fall-through.
   * For Flash eligibility use {@link isFlashEligible} instead.
   */
  async isRegistered(account: string): Promise<boolean> {
    return this.contract.getFunction("isRegistered")(account) as Promise<boolean>;
  }

  /** Whether an address is registered on v2 specifically. */
  async isRegisteredV2(account: string): Promise<boolean> {
    return this.contract.getFunction("isRegisteredV2")(account) as Promise<boolean>;
  }

  /**
   * Whether an address can receive Flash messages (has a ratchet key on v2).
   */
  async isFlashEligible(account: string): Promise<boolean> {
    return this.contract.getFunction("isFlashEligible")(account) as Promise<boolean>;
  }

  /**
   * The ECIES public key for a recipient, with v1 fall-through.
   * Returns "0x" when the account is unknown to both registries.
   */
  async getEncPubKey(account: string): Promise<string> {
    return this.contract.getFunction("getEncPubKey")(account) as Promise<string>;
  }

  /** The ratchet public key for a recipient ("0x" if not opted in). */
  async getRatchetPubKey(account: string): Promise<string> {
    return this.contract.getFunction("getRatchetPubKey")(account) as Promise<string>;
  }

  /** The full v2 record for a recipient (all-empty if not v2-registered). */
  async getRecipient(account: string): Promise<RecipientV2Record> {
    const rec = await this.contract.getFunction("getRecipient")(account);
    return {
      encPubKey: rec.encPubKey as string,
      ratchetPubKey: rec.ratchetPubKey as string,
      encUpdatedAt: rec.encUpdatedAt as bigint,
      ratchetUpdatedAt: rec.ratchetUpdatedAt as bigint,
    };
  }

  /** An extension key for a recipient ("0x" if never set). */
  async getExtKey(account: string, keyType: string): Promise<string> {
    return this.contract.getFunction("getExtKey")(account, keyType) as Promise<string>;
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
