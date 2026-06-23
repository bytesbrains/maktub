/**
 * Hybrid envelope v2 (#139 / D-026 §1).
 *
 * @module
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import {
  IV_LENGTH,
  TAG_LENGTH,
  AES_KEY_LENGTH,
  COMPRESSED_PUBKEY_LENGTH,
  MAX_RECIPIENT_COUNT,
  HYBRID_VERSION,
  HYBRID_WRAP_LENGTH,
} from "./constants.js";
import {
  coerceBytes,
  coercePublicKey,
  writeUint16BE,
  writeUint32BE,
} from "./bytes.js";
import { aesGcmEncrypt, randomBytes } from "./aes.js";
import { deriveKey } from "./kdf.js";
import { padPlaintext, PAD_HEADER_LENGTH } from "./padding.js";
import type { BytesInput } from "./types.js";

// ─────────────────────────────────────────────────────────────
//  Hybrid envelope v2 (#139 / D-026 §1)
//
//  Content encrypted ONCE, the content key wrapped per recipient against a
//  single shared ephemeral key — keeps a multi-recipient text letter small
//  enough to live inline on-chain (MAX_PAYLOAD_BYTES = 4096).
//
//  BYTE-IDENTICAL to mobile/lib/services/crypto/ecies.dart (deterministic,
//  length-prefixed — no CBOR):
//
//    version(1)=0x02 | recipient_count(2 BE) | eph_pub_compressed(33) |
//    content_iv(12) | content_len(4 BE) | content_ct_tag(content_len) |
//    [ wrap_iv(12) | wrapped_key_ct(32) | wrapped_key_tag(16) ] x count
//
//  content_ct_tag = AES-256-GCM(K, content_iv, plaintext)        (ct || tag)
//  per recipient  = AES-256-GCM(KEK_i, wrap_iv_i, K)             (32 || 16)
//  KEK_i          = HKDF-SHA256(eph_pub_uncompressed || ECDH_x(eph_sk, pk_i))
// ─────────────────────────────────────────────────────────────

/**
 * Bytes consumed by everything EXCEPT the message ciphertext, for
 * `recipientCount`. Single source of truth behind {@link maxInlineMessageBytes};
 * keep byte-exact with the serializer.
 */
export function hybridOverhead(recipientCount: number): number {
  return (
    1 + // version
    2 + // recipient count
    COMPRESSED_PUBKEY_LENGTH + // 33 shared ephemeral
    IV_LENGTH + // 12 content iv
    4 + // content length field
    TAG_LENGTH + // 16 content GCM tag
    recipientCount * HYBRID_WRAP_LENGTH // 60 per recipient
  );
}

/**
 * Bytes available for the AES-GCM content (the padded frame) under `cap` for
 * `recipientCount` — i.e. `cap - overhead(N)`. This is what size-bucket padding
 * pads up to; the message itself gets {@link PAD_HEADER_LENGTH} fewer bytes (see
 * {@link maxInlineMessageBytes}).
 */
function maxFramedPlaintext(recipientCount: number, cap: number): number {
  const budget = cap - hybridOverhead(recipientCount);
  return budget < 0 ? 0 : budget;
}

/**
 * Max *message* bytes that fit inline under `cap` (default 4096, the contract's
 * MAX_PAYLOAD_BYTES) for `recipientCount`. Equal to `cap - overhead(N)` minus
 * the {@link PAD_HEADER_LENGTH}-byte size-bucket pad frame (#264); 0 when the
 * overhead alone already leaves no room.
 */
export function maxInlineMessageBytes(recipientCount: number, cap = 4096): number {
  const budget = maxFramedPlaintext(recipientCount, cap) - PAD_HEADER_LENGTH;
  return budget < 0 ? 0 : budget;
}

/** True if `envelope` starts with the v2 hybrid version marker. */
export function looksLikeHybrid(envelope: BytesInput): boolean {
  const e = coerceBytes(envelope);
  return e.length > 0 && e[0] === HYBRID_VERSION;
}

/**
 * Encrypt `plaintext` once and wrap the content key for each recipient in
 * `recipientPublicKeys` (33- or 65-byte keys), returning the v2 envelope bytes.
 * The i-th recipient decrypts with {@link decryptHybridAt} at index i.
 */
export async function encryptHybrid(
  plaintext: BytesInput,
  recipientPublicKeys: BytesInput[],
  cap = 4096
): Promise<Uint8Array> {
  if (recipientPublicKeys.length === 0) {
    throw new Error("encryptHybrid: at least one recipient is required");
  }
  if (recipientPublicKeys.length > MAX_RECIPIENT_COUNT) {
    throw new Error(
      `encryptHybrid: too many recipients (${recipientPublicKeys.length} > ${MAX_RECIPIENT_COUNT})`
    );
  }
  const n = recipientPublicKeys.length;

  // 0. Size-bucket padding (#264): frame + zero-pad the message to a fixed
  // bucket so the on-chain byte length leaks only the bucket, not the true
  // size. Padded plaintext stays within the AES-GCM content budget = cap −
  // envelope overhead, so the final envelope never exceeds `cap`.
  const pt = padPlaintext(coerceBytes(plaintext), maxFramedPlaintext(n, cap));

  // 1. Content key + encrypt content once.
  const contentKey = randomBytes(AES_KEY_LENGTH);
  const contentIv = randomBytes(IV_LENGTH);
  const { ciphertext: contentCt, tag: contentTag } = await aesGcmEncrypt(
    contentKey,
    contentIv,
    pt
  );

  // 2. One shared ephemeral keypair for all recipients.
  const ephSk = secp256k1.utils.randomPrivateKey();
  const ephCompressed = secp256k1.getPublicKey(ephSk, true); // 33
  const ephUncompressed = secp256k1.getPublicKey(ephSk, false); // 65

  // 3. Wrap the content key per recipient.
  const wraps: Uint8Array[] = [];
  for (const pkInput of recipientPublicKeys) {
    const pk = coercePublicKey(pkInput);
    const sharedPoint = secp256k1.getSharedSecret(ephSk, pk, false); // 65
    const sharedX = sharedPoint.subarray(1, 33);
    const kek = deriveKey(ephUncompressed, sharedX);
    const wrapIv = randomBytes(IV_LENGTH);
    const { ciphertext: wCt, tag: wTag } = await aesGcmEncrypt(
      kek,
      wrapIv,
      contentKey
    );
    const wrap = new Uint8Array(HYBRID_WRAP_LENGTH);
    wrap.set(wrapIv, 0);
    wrap.set(wCt, IV_LENGTH);
    wrap.set(wTag, IV_LENGTH + wCt.length);
    wraps.push(wrap);
  }

  // 4. Serialize (length-prefixed, deterministic).
  const contentLen = contentCt.length + contentTag.length;
  const out = new Uint8Array(hybridOverhead(n) + pt.length);
  let off = 0;
  out[off++] = HYBRID_VERSION;
  writeUint16BE(out, off, n);
  off += 2;
  out.set(ephCompressed, off);
  off += COMPRESSED_PUBKEY_LENGTH;
  out.set(contentIv, off);
  off += IV_LENGTH;
  writeUint32BE(out, off, contentLen);
  off += 4;
  out.set(contentCt, off);
  off += contentCt.length;
  out.set(contentTag, off);
  off += contentTag.length;
  for (const w of wraps) {
    out.set(w, off);
    off += w.length;
  }
  return out;
}
