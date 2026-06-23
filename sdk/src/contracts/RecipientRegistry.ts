/**
 * Typed wrapper for the RecipientRegistry contract.
 *
 * RecipientRegistry is the immutable registry where recipients store their
 * Proxy Re-Encryption (PRE) public keys. Recipients must register before
 * they can be assigned to any heartbeat.
 *
 * @module
 */

import {
  Contract,
  type ContractTransactionResponse,
  type Provider,
  type Signer,
} from "ethers";
import { RECIPIENT_REGISTRY_ABI } from "../constants/abis.js";
import { SignerRequiredError } from "../errors/index.js";

/**
 * Typed wrapper around the RecipientRegistry smart contract.
 */
export class RecipientRegistryContract {
  /** The underlying ethers Contract instance. */
  public readonly contract: Contract;

  private readonly _signer: Signer | undefined;

  /**
   * Create a new RecipientRegistryContract wrapper.
   * @param address - The deployed RecipientRegistry contract address.
   * @param provider - An ethers v6 Provider for read calls.
   * @param signer - An optional ethers v6 Signer for write transactions.
   */
  constructor(address: string, provider: Provider, signer?: Signer) {
    this._signer = signer;
    this.contract = new Contract(address, RECIPIENT_REGISTRY_ABI, signer ?? provider);
  }

  // ──────────────────────────────────────────────
  //  Write Functions
  // ──────────────────────────────────────────────

  /**
   * Register the caller as a recipient with a PRE public key.
   * Registration is free (gas only). Cannot register twice.
   *
   * @param prePublicKey - The caller's PRE public key (hex string or Uint8Array).
   * @returns The transaction response.
   * @throws {SignerRequiredError} If no signer is configured.
   */
  async register(prePublicKey: string | Uint8Array): Promise<ContractTransactionResponse> {
    this._requireSigner("register");
    return this.contract.getFunction("register")(prePublicKey) as Promise<ContractTransactionResponse>;
  }

  /**
   * Update the caller's PRE public key. Only callable by registered recipients.
   *
   * @param newPrePublicKey - The new PRE public key (hex string or Uint8Array).
   * @returns The transaction response.
   * @throws {SignerRequiredError} If no signer is configured.
   */
  async updatePrePublicKey(
    newPrePublicKey: string | Uint8Array
  ): Promise<ContractTransactionResponse> {
    this._requireSigner("updatePrePublicKey");
    return this.contract.getFunction("updatePrePublicKey")(newPrePublicKey) as Promise<ContractTransactionResponse>;
  }

  // ──────────────────────────────────────────────
  //  Read Functions
  // ──────────────────────────────────────────────

  /**
   * Check whether an address is registered as a recipient.
   *
   * @param account - The address to check.
   * @returns True if the address is registered.
   */
  async isRegistered(account: string): Promise<boolean> {
    return this.contract.getFunction("isRegistered")(account) as Promise<boolean>;
  }

  /**
   * Retrieve the PRE public key for a registered recipient.
   *
   * @param account - The recipient address.
   * @returns The PRE public key as hex-encoded bytes. Empty if not registered.
   */
  async getPrePublicKey(account: string): Promise<string> {
    return this.contract.getFunction("getPrePublicKey")(account) as Promise<string>;
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
