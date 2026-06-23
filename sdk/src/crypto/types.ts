/**
 * Shared types for the ECIES encryption layer.
 *
 * @module
 */

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

/** A freshly generated ECIES keypair. */
export interface Keypair {
  /** 33-byte compressed secp256k1 public key. */
  publicKey: Uint8Array;
  /** 32-byte secp256k1 private key. */
  privateKey: Uint8Array;
}

/** Input accepted for any byte-like parameter. */
export type BytesInput = Uint8Array | string;
