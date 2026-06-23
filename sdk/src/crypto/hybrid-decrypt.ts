/**
 * Hybrid envelope v2 decryption (#139 / D-026 §1).
 *
 * Inverse of {@link import("./hybrid.js").encryptHybrid}. See `hybrid.ts`
 * for the envelope layout banner.
 *
 * @module
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import {
  IV_LENGTH,
  TAG_LENGTH,
  AES_KEY_LENGTH,
  COMPRESSED_PUBKEY_LENGTH,
  HYBRID_VERSION,
  HYBRID_WRAP_LENGTH,
} from "./constants.js";
import {
  coerceBytes,
  coercePrivateKey,
  readUint16BE,
  readUint32BE,
} from "./bytes.js";
import { aesGcmDecrypt } from "./aes.js";
import { deriveKey } from "./kdf.js";
import { unpadPlaintext } from "./padding.js";
import type { BytesInput } from "./types.js";

/**
 * Decrypt the v2 `envelope` for the recipient at `index` with their
 * `privateKey`. Throws on a malformed envelope, an out-of-range index, or
 * failed authentication.
 */
export async function decryptHybridAt(
  privateKey: BytesInput,
  envelope: BytesInput,
  index: number
): Promise<Uint8Array> {
  const sk = coercePrivateKey(privateKey);
  const env = coerceBytes(envelope);
  const headerMin =
    1 + 2 + COMPRESSED_PUBKEY_LENGTH + IV_LENGTH + 4;
  if (env.length < headerMin || env[0] !== HYBRID_VERSION) {
    throw new Error("decryptHybridAt: not a v2 hybrid envelope");
  }
  let off = 1;
  const n = readUint16BE(env, off);
  off += 2;
  if (index < 0 || index >= n) {
    throw new Error(`decryptHybridAt: index ${index} out of range (count ${n})`);
  }
  const ephCompressed = env.subarray(off, off + COMPRESSED_PUBKEY_LENGTH);
  off += COMPRESSED_PUBKEY_LENGTH;
  const contentIv = env.subarray(off, off + IV_LENGTH);
  off += IV_LENGTH;
  const contentLen = readUint32BE(env, off);
  off += 4;
  if (contentLen < TAG_LENGTH || off + contentLen > env.length) {
    throw new Error("decryptHybridAt: malformed content length");
  }
  const contentCtTag = env.subarray(off, off + contentLen);
  off += contentLen;

  // The whole envelope must be exactly header + content + N fixed-size wraps.
  const expectedLength = off + n * HYBRID_WRAP_LENGTH;
  if (env.length !== expectedLength) {
    throw new Error(
      `decryptHybridAt: envelope length mismatch (expected ${expectedLength}, got ${env.length})`
    );
  }

  const wrapStart = off + index * HYBRID_WRAP_LENGTH;
  const wrapIv = env.subarray(wrapStart, wrapStart + IV_LENGTH);
  const wrapCt = env.subarray(
    wrapStart + IV_LENGTH,
    wrapStart + IV_LENGTH + AES_KEY_LENGTH
  );
  const wrapTag = env.subarray(
    wrapStart + IV_LENGTH + AES_KEY_LENGTH,
    wrapStart + HYBRID_WRAP_LENGTH
  );

  // Recompute the KEK from the recipient key + shared ephemeral. A malformed
  // ephemeral point or bad scalar makes @noble throw an un-prefixed error;
  // wrap it so callers get a consistent decryptHybridAt failure.
  let ephUncompressed: Uint8Array;
  let sharedPoint: Uint8Array;
  try {
    ephUncompressed = secp256k1.ProjectivePoint.fromHex(ephCompressed).toRawBytes(
      false
    );
    sharedPoint = secp256k1.getSharedSecret(sk, ephCompressed, false);
  } catch (err) {
    throw new Error(
      `decryptHybridAt: ECDH key derivation failed: ${(err as Error).message}`
    );
  }
  const sharedX = sharedPoint.subarray(1, 33);
  const kek = deriveKey(ephUncompressed, sharedX);

  const contentKey = await aesGcmDecrypt(kek, wrapIv, wrapCt, wrapTag);
  const contentCt = contentCtTag.subarray(0, contentLen - TAG_LENGTH);
  const contentTag = contentCtTag.subarray(contentLen - TAG_LENGTH);
  const padded = await aesGcmDecrypt(contentKey, contentIv, contentCt, contentTag);
  // Strip the size-bucket pad frame (#264); pre-padding envelopes pass through.
  return unpadPlaintext(padded);
}
