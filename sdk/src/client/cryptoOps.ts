/**
 * Payload encryption mixin (ECIES on secp256k1) for {@link MaktubClient}.
 *
 * @module
 */

import {
  generateKeypair,
  encryptBundle,
  decryptBundleAt,
  parseBundle,
  publicKeyFromPrivate,
  bytesToHex,
  type Keypair,
  type BytesInput,
} from "../crypto/ecies.js";
import type { MaktubClientConstructor } from "./base.js";

export interface ICryptoOps {
  generateRecipientKey(): Keypair;
  publicKeyFor(privateKey: BytesInput, compressed?: boolean): Uint8Array;
  encryptForRecipients(
    plaintext: BytesInput,
    recipientPublicKeys: BytesInput[]
  ): Promise<Uint8Array>;
  encryptForRegisteredRecipients(
    plaintext: BytesInput,
    recipientAddresses: string[]
  ): Promise<Uint8Array>;
  decryptMyBlob(
    bundle: BytesInput,
    privateKey: BytesInput,
    myIndex: number
  ): Promise<Uint8Array>;
  inspectBundle(bundle: BytesInput): { version: number; count: number };
  bytesToHex(b: Uint8Array): string;
}

export function CryptoOps<TBase extends MaktubClientConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => ICryptoOps) {
  return class extends Base {
    // ──────────────────────────────────────────────
    //  Payload Encryption (ECIES on secp256k1)
    // ──────────────────────────────────────────────

    /**
     * Generate a fresh ECIES keypair for a recipient.
     *
     * The public key (33-byte compressed) is registered on-chain via
     * {@link registerRecipient}. The private key MUST be persisted
     * locally (browser: localStorage / IndexedDB; mobile: secure
     * storage) — if lost, the recipient can never decrypt any
     * heartbeat sent to them.
     *
     * Pure function; no network calls. Safe to call without calling
     * {@link init} first.
     */
    generateRecipientKey(): Keypair {
      return generateKeypair();
    }

    /**
     * Derive the public key from a stored private key (e.g. when
     * restoring from secure storage and needing to re-register or
     * display the identity).
     */
    publicKeyFor(privateKey: BytesInput, compressed = true): Uint8Array {
      return publicKeyFromPrivate(privateKey, compressed);
    }

    /**
     * Encrypt a plaintext for an ordered list of recipient public keys
     * and return the bundle bytes that should be passed as `payload` to
     * {@link createHeartbeat}.
     *
     * The order MUST match the `recipients` array passed to
     * `createHeartbeat` — recipients decrypt by their array index.
     */
    encryptForRecipients(
      plaintext: BytesInput,
      recipientPublicKeys: BytesInput[]
    ): Promise<Uint8Array> {
      return encryptBundle(plaintext, recipientPublicKeys);
    }

    /**
     * Convenience: fetch each recipient's ECIES public key from the
     * on-chain `RecipientRegistry` and then encrypt the plaintext for
     * all of them.
     *
     * Throws if any recipient is not registered.
     */
    async encryptForRegisteredRecipients(
      plaintext: BytesInput,
      recipientAddresses: string[]
    ): Promise<Uint8Array> {
      await this._ensureInit();
      const pubkeys: string[] = [];
      for (const addr of recipientAddresses) {
        const registered = await this.registry.isRegistered(addr);
        if (!registered) {
          throw new Error(
            `encryptForRegisteredRecipients: ${addr} is not registered in RecipientRegistry`
          );
        }
        const pk = await this.registry.getPrePublicKey(addr);
        pubkeys.push(pk);
      }
      return encryptBundle(plaintext, pubkeys);
    }

    /**
     * Decrypt the caller's blob from a delivered bundle.
     *
     * @param bundle - The bundle bytes (contract `heartbeat.payload`).
     * @param privateKey - The caller's ECIES private key.
     * @param myIndex - The caller's position in `heartbeat.recipients`.
     * @returns The decrypted plaintext bytes.
     */
    decryptMyBlob(
      bundle: BytesInput,
      privateKey: BytesInput,
      myIndex: number
    ): Promise<Uint8Array> {
      return decryptBundleAt(bundle, privateKey, myIndex);
    }

    /**
     * Inspect a bundle without decrypting. Useful for UI that wants to
     * display "this payload has N recipients, yours is blob #k".
     */
    inspectBundle(bundle: BytesInput): { version: number; count: number } {
      const { version, blobs } = parseBundle(bundle);
      return { version, count: blobs.length };
    }

    /**
     * Hex-encode bytes (0x-prefixed). Useful when chaining encrypt
     * helpers into ethers' `bytes`-typed contract arguments, which
     * accept both `Uint8Array` and hex strings.
     */
    bytesToHex(b: Uint8Array): string {
      return bytesToHex(b);
    }
  };
}
