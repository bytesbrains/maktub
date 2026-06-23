/**
 * Size-bucket payload padding (#264).
 *
 * On a public L2 the envelope's *contents* are sealed (ECIES), but its
 * **byte length** is plaintext metadata: a 30-byte seed phrase and a 4 KB
 * document are trivially distinguishable to any observer. This module hides
 * the exact size by framing the message and zero-padding it up to the next
 * fixed bucket *before* it enters the AES-GCM content layer, so an inline
 * on-chain payload only reveals which bucket the message falls into — never
 * its true length.
 *
 * This is a purely client-side encode/decode concern: the protocol, the
 * on-chain format, and the hybrid envelope wire layout are all unchanged.
 * Padding lives in the plaintext that the envelope carries; {@link unpadPlaintext}
 * reverses it after decryption. Old (unframed) envelopes already on-chain are
 * returned verbatim, so the change is fully backward-compatible.
 *
 * Bucketing applies only up to the caller's `maxPadded` budget (for inline
 * payloads, `cap − envelope overhead`). A message too large to inline is
 * framed but NOT bucket-padded: it spills to an off-chain CID, whose on-chain
 * footprint is already a fixed-size reference, so padding would buy no privacy
 * and only waste storage.
 *
 * BYTE-IDENTICAL to mobile/lib/services/crypto/ecies.dart — both
 * implementations MUST agree so a Dart-sealed letter unpads in TS and vice
 * versa.
 *
 *   PAD FRAME v1:
 *     magic(3) = 'M' 'K' 'P' (0x4D 0x4B 0x50) | version(1)=0x01 |
 *     true_len(4 BE) | message(true_len) | zero_padding(...)
 *
 * @module
 */

/** Pad-frame magic: ASCII "MKP". */
const PAD_MAGIC = Uint8Array.of(0x4d, 0x4b, 0x50);
/** Pad-frame version byte. */
const PAD_VERSION = 0x01;
/** Frame header: magic(3) + version(1) + true_len(4 BE). */
export const PAD_HEADER_LENGTH = PAD_MAGIC.length + 1 + 4; // 8

/**
 * Size buckets (target framed-plaintext lengths, in bytes). A message is padded
 * up to the smallest bucket that fits the frame; if it sits between buckets but
 * still inlines, it is padded to the budget itself. Geometric so common short
 * letters (a seed phrase, a note) collapse into a handful of large anonymity
 * sets at trivial L2 gas cost, while still leaving room for multi-KB documents.
 */
const PAD_BUCKETS = [64, 128, 256, 512, 1024, 2048, 4096] as const;

/**
 * Padded length for a frame of `framedLen` bytes under an inline budget of
 * `maxPadded`:
 *  - too large to inline (`framedLen > maxPadded`) → `framedLen` (frame only,
 *    no bucket padding; the caller spills it to an off-chain CID),
 *  - otherwise the smallest bucket that fits, or `maxPadded` when it sits
 *    between the largest fitting bucket and the budget.
 */
function chooseBucket(framedLen: number, maxPadded: number): number {
  if (framedLen > maxPadded) return framedLen;
  for (const b of PAD_BUCKETS) {
    if (b >= framedLen && b <= maxPadded) return b;
  }
  return maxPadded;
}

/**
 * Frame `message` and zero-pad it to a fixed size bucket bounded by `maxPadded`
 * (the inline AES-GCM content budget = cap − envelope overhead). A message that
 * exceeds the budget is framed without bucket padding so the caller's
 * inline-vs-CID size check routes it off-chain.
 */
export function padPlaintext(message: Uint8Array, maxPadded: number): Uint8Array {
  const framedLen = PAD_HEADER_LENGTH + message.length;
  const padded = chooseBucket(framedLen, maxPadded);
  const out = new Uint8Array(padded); // zero-filled
  out.set(PAD_MAGIC, 0);
  out[3] = PAD_VERSION;
  out[4] = (message.length >>> 24) & 0xff;
  out[5] = (message.length >>> 16) & 0xff;
  out[6] = (message.length >>> 8) & 0xff;
  out[7] = message.length & 0xff;
  out.set(message, PAD_HEADER_LENGTH);
  return out;
}

/**
 * Reverse {@link padPlaintext}. Returns the original message when `plaintext`
 * carries a valid pad frame; otherwise returns `plaintext` unchanged so
 * pre-padding (legacy, already on-chain) envelopes still decrypt correctly.
 */
export function unpadPlaintext(plaintext: Uint8Array): Uint8Array {
  if (
    plaintext.length >= PAD_HEADER_LENGTH &&
    plaintext[0] === PAD_MAGIC[0] &&
    plaintext[1] === PAD_MAGIC[1] &&
    plaintext[2] === PAD_MAGIC[2] &&
    plaintext[3] === PAD_VERSION
  ) {
    const trueLen =
      (plaintext[4]! * 0x1000000) +
      ((plaintext[5]! << 16) | (plaintext[6]! << 8) | plaintext[7]!);
    if (PAD_HEADER_LENGTH + trueLen <= plaintext.length) {
      return plaintext.subarray(PAD_HEADER_LENGTH, PAD_HEADER_LENGTH + trueLen);
    }
  }
  return plaintext;
}
