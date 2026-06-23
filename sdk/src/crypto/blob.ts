/**
 * Single-blob ECIES encryption/decryption.
 *
 * Blob layout: `ephemeral_pub_uncompressed(65) | iv(12) | tag(16) | ciphertext`.
 *
 * @module
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import {
  IV_LENGTH,
  TAG_LENGTH,
  UNCOMPRESSED_PUBKEY_LENGTH,
} from "./constants.js";
import { coerceBytes, coercePublicKey, coercePrivateKey } from "./bytes.js";
import { aesGcmEncrypt, aesGcmDecrypt, randomBytes } from "./aes.js";
import { deriveKey } from "./kdf.js";
import type { BytesInput } from "./types.js";

// ─────────────────────────────────────────────────────────────
//  Single-blob ECIES
// ─────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext for a single recipient, producing one ECIES blob.
 *
 * Blob layout: `ephemeral_pub_uncompressed(65) | iv(12) | tag(16) | ciphertext`.
 */
export async function encryptBlob(
  recipientPublicKey: BytesInput,
  plaintext: BytesInput
): Promise<Uint8Array> {
  const recipientPk = coercePublicKey(recipientPublicKey);
  const pt = coerceBytes(plaintext);

  // Ephemeral keypair
  const ephemeralSk = secp256k1.utils.randomPrivateKey();
  const ephemeralPkUncompressed = secp256k1.getPublicKey(ephemeralSk, false);

  // ECDH: compute recipient_pk * ephemeral_sk. @noble's getSharedSecret
  // returns uncompressed point (65 bytes, 0x04 || X || Y) when passed
  // `isCompressed = false`. We want the X coord (bytes 1..33).
  const sharedPoint = secp256k1.getSharedSecret(ephemeralSk, recipientPk, false);
  const sharedX = sharedPoint.slice(1, 33);

  const key = deriveKey(ephemeralPkUncompressed, sharedX);
  const iv = randomBytes(IV_LENGTH);
  const { ciphertext, tag } = await aesGcmEncrypt(key, iv, pt);

  const blob = new Uint8Array(
    UNCOMPRESSED_PUBKEY_LENGTH + IV_LENGTH + TAG_LENGTH + ciphertext.length
  );
  let off = 0;
  blob.set(ephemeralPkUncompressed, off);
  off += UNCOMPRESSED_PUBKEY_LENGTH;
  blob.set(iv, off);
  off += IV_LENGTH;
  blob.set(tag, off);
  off += TAG_LENGTH;
  blob.set(ciphertext, off);
  return blob;
}

/**
 * Decrypt a single ECIES blob with the recipient's private key.
 */
export async function decryptBlob(
  privateKey: BytesInput,
  blob: BytesInput
): Promise<Uint8Array> {
  const sk = coercePrivateKey(privateKey);
  const b = coerceBytes(blob);
  const minLength = UNCOMPRESSED_PUBKEY_LENGTH + IV_LENGTH + TAG_LENGTH;
  if (b.length < minLength) {
    throw new Error(
      `ECIES blob too short: ${b.length} bytes (minimum ${minLength})`
    );
  }

  const ephemeralPk = b.slice(0, UNCOMPRESSED_PUBKEY_LENGTH);
  const iv = b.slice(
    UNCOMPRESSED_PUBKEY_LENGTH,
    UNCOMPRESSED_PUBKEY_LENGTH + IV_LENGTH
  );
  const tag = b.slice(
    UNCOMPRESSED_PUBKEY_LENGTH + IV_LENGTH,
    UNCOMPRESSED_PUBKEY_LENGTH + IV_LENGTH + TAG_LENGTH
  );
  const ciphertext = b.slice(UNCOMPRESSED_PUBKEY_LENGTH + IV_LENGTH + TAG_LENGTH);

  const sharedPoint = secp256k1.getSharedSecret(sk, ephemeralPk, false);
  const sharedX = sharedPoint.slice(1, 33);
  const key = deriveKey(ephemeralPk, sharedX);

  return aesGcmDecrypt(key, iv, ciphertext, tag);
}
