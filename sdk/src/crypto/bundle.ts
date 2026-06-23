/**
 * Multi-recipient bundle: a single plaintext encrypted once per recipient,
 * concatenated into one on-chain bundle (v1 format).
 *
 * Bundle layout:
 *   `[1B version=0x01 | 2B count BE | repeated [4B len BE | blob]]`
 *
 * @module
 */

import { encryptBlob, decryptBlob } from "./blob.js";
import {
  coerceBytes,
  writeUint16BE,
  readUint16BE,
  writeUint32BE,
  readUint32BE,
} from "./bytes.js";
import {
  BUNDLE_VERSION,
  MAX_BLOB_LENGTH,
  MAX_RECIPIENT_COUNT,
} from "./constants.js";
import type { BytesInput } from "./types.js";

// ─────────────────────────────────────────────────────────────
//  Multi-recipient bundle
// ─────────────────────────────────────────────────────────────

/**
 * Encrypt a single plaintext for an ordered list of recipients and
 * produce a single on-chain bundle per the v1 format.
 *
 * The order of `recipientPublicKeys` MUST match the order of recipients
 * passed to `MaktubCore.createHeartbeat(...)`. Recipients decrypt by
 * their index into that array.
 */
export async function encryptBundle(
  plaintext: BytesInput,
  recipientPublicKeys: BytesInput[]
): Promise<Uint8Array> {
  if (recipientPublicKeys.length === 0) {
    throw new Error("encryptBundle: at least one recipient is required");
  }
  if (recipientPublicKeys.length > MAX_RECIPIENT_COUNT) {
    throw new Error(
      `encryptBundle: too many recipients (${recipientPublicKeys.length} > ${MAX_RECIPIENT_COUNT})`
    );
  }

  const blobs: Uint8Array[] = [];
  for (const pk of recipientPublicKeys) {
    const blob = await encryptBlob(pk, plaintext);
    if (blob.length > MAX_BLOB_LENGTH) {
      throw new Error(
        `encryptBundle: blob too large (${blob.length} > ${MAX_BLOB_LENGTH})`
      );
    }
    blobs.push(blob);
  }

  let total = 1 /* version */ + 2; /* count */
  for (const b of blobs) total += 4 + b.length;

  const bundle = new Uint8Array(total);
  let off = 0;
  bundle[off++] = BUNDLE_VERSION;
  writeUint16BE(bundle, off, blobs.length);
  off += 2;
  for (const b of blobs) {
    writeUint32BE(bundle, off, b.length);
    off += 4;
    bundle.set(b, off);
    off += b.length;
  }
  return bundle;
}

/**
 * Parse a bundle into its constituent blobs. Useful for debugging and
 * for clients that want to see "is my blob in this bundle" without
 * decrypting.
 */
export function parseBundle(bundle: BytesInput): {
  version: number;
  blobs: Uint8Array[];
} {
  const b = coerceBytes(bundle);
  if (b.length < 3) throw new Error("bundle too short (need at least 3 bytes)");
  const version = b[0]!;
  if (version !== BUNDLE_VERSION) {
    throw new Error(
      `unsupported bundle version: 0x${version.toString(16)} (expected 0x${BUNDLE_VERSION.toString(16)})`
    );
  }
  const count = readUint16BE(b, 1);
  const blobs: Uint8Array[] = [];
  let off = 3;
  for (let i = 0; i < count; i++) {
    if (off + 4 > b.length) {
      throw new Error(
        `bundle truncated: missing length header for blob ${i}`
      );
    }
    const len = readUint32BE(b, off);
    off += 4;
    if (off + len > b.length) {
      throw new Error(
        `bundle truncated: blob ${i} needs ${len} bytes, only ${b.length - off} left`
      );
    }
    blobs.push(b.slice(off, off + len));
    off += len;
  }
  if (off !== b.length) {
    throw new Error(
      `bundle has ${b.length - off} trailing bytes after ${count} blobs`
    );
  }
  return { version, blobs };
}

/**
 * Decrypt the blob at position `index` with the recipient's private key.
 *
 * `index` MUST equal the recipient's position in the on-chain
 * `heartbeat.recipients` array.
 */
export async function decryptBundleAt(
  bundle: BytesInput,
  privateKey: BytesInput,
  index: number
): Promise<Uint8Array> {
  const { blobs } = parseBundle(bundle);
  if (index < 0 || index >= blobs.length) {
    throw new Error(
      `decryptBundleAt: index ${index} out of range (bundle has ${blobs.length} blobs)`
    );
  }
  return decryptBlob(privateKey, blobs[index]!);
}
