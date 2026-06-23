/**
 * secp256k1 keypair generation and derivation for the ECIES
 * encryption layer.
 *
 * @module
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { coercePrivateKey } from "./bytes.js";
import type { BytesInput, Keypair } from "./types.js";

// ─────────────────────────────────────────────────────────────
//  Keypair generation
// ─────────────────────────────────────────────────────────────

/**
 * Generate a fresh ECIES keypair on secp256k1.
 *
 * The private key is a uniformly random 32-byte scalar in [1, n-1].
 * The public key is returned in 33-byte compressed form.
 */
export function generateKeypair(): Keypair {
  // @noble rejects zero and values >= n by retrying internally
  // when we call utils.randomPrivateKey().
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed
  return { publicKey, privateKey };
}

/**
 * Derive the public key for a given private key.
 * Useful when restoring a keypair from storage.
 */
export function publicKeyFromPrivate(
  privateKey: BytesInput,
  compressed = true
): Uint8Array {
  const sk = coercePrivateKey(privateKey);
  return secp256k1.getPublicKey(sk, compressed);
}
