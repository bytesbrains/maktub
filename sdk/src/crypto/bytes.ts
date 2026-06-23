/**
 * Byte / hex helpers and big-endian integer (de)serializers for the
 * ECIES encryption layer.
 *
 * Kept dependency-free so the encryption modules have no extra deps.
 *
 * @module
 */

import {
  COMPRESSED_PUBKEY_LENGTH,
  UNCOMPRESSED_PUBKEY_LENGTH,
  PRIVATE_KEY_LENGTH,
} from "./constants.js";
import type { BytesInput } from "./types.js";

// ─────────────────────────────────────────────────────────────
//  Hex helpers (kept local so the module has no other deps)
// ─────────────────────────────────────────────────────────────

const HEX_RE = /^(0x)?[0-9a-fA-F]*$/;

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!HEX_RE.test(hex)) throw new Error(`invalid hex string: ${hex}`);
  if (clean.length % 2 !== 0) {
    throw new Error(`hex string has odd length: ${clean.length}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = "0x";
  for (let i = 0; i < b.length; i++) {
    s += (b[i]! >>> 4).toString(16) + (b[i]! & 0xf).toString(16);
  }
  return s;
}

export function coerceBytes(input: BytesInput): Uint8Array {
  if (typeof input === "string") {
    // If it looks like hex (with or without 0x), parse as hex. Otherwise UTF-8.
    if (input.startsWith("0x") || (HEX_RE.test(input) && input.length % 2 === 0 && input.length > 0)) {
      return hexToBytes(input);
    }
    return new TextEncoder().encode(input);
  }
  return input;
}

export function coercePublicKey(input: BytesInput): Uint8Array {
  const raw = typeof input === "string" ? hexToBytes(input) : input;
  if (
    raw.length !== COMPRESSED_PUBKEY_LENGTH &&
    raw.length !== UNCOMPRESSED_PUBKEY_LENGTH
  ) {
    throw new Error(
      `invalid secp256k1 public key length: ${raw.length} ` +
        `(expected ${COMPRESSED_PUBKEY_LENGTH} or ${UNCOMPRESSED_PUBKEY_LENGTH})`
    );
  }
  return raw;
}

export function coercePrivateKey(input: BytesInput): Uint8Array {
  const raw = typeof input === "string" ? hexToBytes(input) : input;
  if (raw.length !== PRIVATE_KEY_LENGTH) {
    throw new Error(
      `invalid secp256k1 private key length: ${raw.length} ` +
        `(expected ${PRIVATE_KEY_LENGTH})`
    );
  }
  return raw;
}

// ─────────────────────────────────────────────────────────────
//  Big-endian integer (de)serializers
// ─────────────────────────────────────────────────────────────

export function writeUint16BE(dst: Uint8Array, offset: number, value: number): void {
  dst[offset] = (value >>> 8) & 0xff;
  dst[offset + 1] = value & 0xff;
}

export function readUint16BE(src: Uint8Array, offset: number): number {
  return ((src[offset]! & 0xff) << 8) | (src[offset + 1]! & 0xff);
}

export function writeUint32BE(dst: Uint8Array, offset: number, value: number): void {
  dst[offset] = (value >>> 24) & 0xff;
  dst[offset + 1] = (value >>> 16) & 0xff;
  dst[offset + 2] = (value >>> 8) & 0xff;
  dst[offset + 3] = value & 0xff;
}

export function readUint32BE(src: Uint8Array, offset: number): number {
  return (
    ((src[offset]! & 0xff) * 0x1000000) + // avoid sign issues on top bit
    (((src[offset + 1]! & 0xff) << 16) |
      ((src[offset + 2]! & 0xff) << 8) |
      (src[offset + 3]! & 0xff))
  );
}
