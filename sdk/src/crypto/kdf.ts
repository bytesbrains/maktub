/**
 * HKDF-SHA256 key derivation for the ECIES encryption layer.
 *
 * @module
 */

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { AES_KEY_LENGTH } from "./constants.js";

/** Derive the AES-256 key from the ECDH shared secret per the spec. */
export function deriveKey(
  ephemeralPubUncompressed: Uint8Array, // 65 bytes
  sharedX: Uint8Array // 32 bytes
): Uint8Array {
  const ikm = new Uint8Array(ephemeralPubUncompressed.length + sharedX.length);
  ikm.set(ephemeralPubUncompressed, 0);
  ikm.set(sharedX, ephemeralPubUncompressed.length);
  return hkdf(sha256, ikm, undefined, undefined, AES_KEY_LENGTH);
}
