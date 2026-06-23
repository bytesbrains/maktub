/**
 * Reading-key derivation (#300, D-043).
 *
 * The ECIES *reading* key is **reproduced from account control, never stored**
 * — there is no encrypted key blob anywhere. Two account kinds feed a single
 * shared final step:
 *
 *   - `localKey`  : `kind_secret = HKDF-SHA256(ikm = 64-byte BIP-39 seed, ...)`
 *   - `smartWallet`: `kind_secret = WebAuthn PRF (hmac-secret) output (32 B)`
 *
 * Both then run {@link deriveReadingKeyFromSecret}, which maps the 32-byte
 * `kind_secret` to a valid secp256k1 reading keypair. The public half is what
 * gets published to `RecipientRegistry`; the wire/ECIES format (§5) and every
 * *sender's* path are unchanged — only how the *recipient* obtains its scalar
 * changes.
 *
 * All label strings below are the canonical, versioned domain separators.
 * **Spec: the reading-key derivation issue (maktub#304)** — the readable
 * mirror of operator-local `internal/product/ENCRYPTION_FORMAT.md` §10. They
 * are exact UTF-8 byte sequences — every port that DERIVES the key (today TS +
 * Dart) MUST agree byte-for-byte (a divergence permanently orphans a user's
 * letters). The committed test vectors are the cross-language contract.
 *
 * @module
 */

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { secp256k1 } from "@noble/curves/secp256k1";
import { PRIVATE_KEY_LENGTH } from "./constants.js";
import type { Keypair } from "./types.js";

const utf8 = new TextEncoder();

/** HKDF-Extract salt for the `localKey` seed → kind_secret step. */
export const LOCALKEY_EXTRACT_SALT = "maktub:reading-key:salt:v1";
/** HKDF info for the `localKey` seed → kind_secret step. */
export const LOCALKEY_EXTRACT_INFO = "maktub:reading-key:localKey:v1";
/** HKDF info for the raw-key (no-seed) `localKey` import → kind_secret step. */
export const RAWKEY_EXTRACT_INFO = "maktub:reading-key:rawkey:v1";
/** HKDF info label for the shared kind_secret → scalar step (a 1-byte counter is appended). */
export const READING_SCALAR_INFO = "maktub:ecies:secp256k1:reading:v1";
/** Preimage SHA-256'd to produce the fixed 32-byte WebAuthn PRF `eval.first` salt. */
export const PRF_SALT_PREIMAGE = "maktub:ecies:prf:v1";

const N = secp256k1.CURVE.n;

function bytesToBigIntBE(b: Uint8Array): bigint {
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  return x;
}

/**
 * Shared final step: map a uniform 32-byte `kindSecret` to a valid secp256k1
 * reading keypair via HKDF + rejection sampling.
 *
 * `info = utf8(READING_SCALAR_INFO) || uint8(ctr)`, `ctr` starting at 0 and
 * incrementing only on the (≈2⁻¹²⁸) chance the 256-bit output is 0 or ≥ n.
 * HKDF salt is empty (the IKM is already a uniform secret).
 */
export function deriveReadingKeyFromSecret(kindSecret: Uint8Array): Keypair {
  if (kindSecret.length !== PRIVATE_KEY_LENGTH) {
    throw new Error(`kindSecret must be ${PRIVATE_KEY_LENGTH} bytes`);
  }
  const label = utf8.encode(READING_SCALAR_INFO);
  for (let ctr = 0; ctr <= 0xff; ctr++) {
    const info = new Uint8Array(label.length + 1);
    info.set(label, 0);
    info[label.length] = ctr;
    const okm = hkdf(sha256, kindSecret, undefined, info, PRIVATE_KEY_LENGTH);
    const k = bytesToBigIntBE(okm);
    if (k !== 0n && k < N) {
      return { privateKey: okm, publicKey: secp256k1.getPublicKey(okm, true) };
    }
  }
  // Unreachable in practice: P(one miss) ≈ 2⁻¹²⁸, so 256 misses is impossible.
  throw new Error("reading-key derivation exhausted the counter");
}

/**
 * `localKey` accounts: derive the reading keypair from the 64-byte BIP-39 seed
 * (the same seed that derives the signing key at `m/44'/60'/0'/0/0`).
 * Domain-separated by a labeled HKDF — unreachable from any BIP-32 tree walk.
 */
export function deriveReadingKeyFromSeed(seed: Uint8Array): Keypair {
  const kindSecret = hkdf(
    sha256,
    seed,
    utf8.encode(LOCALKEY_EXTRACT_SALT),
    utf8.encode(LOCALKEY_EXTRACT_INFO),
    PRIVATE_KEY_LENGTH
  );
  return deriveReadingKeyFromSecret(kindSecret);
}

/**
 * Raw-key `localKey` accounts — imported as a bare private key, with no BIP-39
 * seed. Derive the reading keypair from the 32-byte signing private key (the
 * account's "one secret"), so re-importing the same key reproduces it. Shares
 * the localKey extract salt; domain-separated by a distinct info label.
 */
export function deriveReadingKeyFromPrivateKey(privateKey: Uint8Array): Keypair {
  if (privateKey.length !== PRIVATE_KEY_LENGTH) {
    throw new Error(`privateKey must be ${PRIVATE_KEY_LENGTH} bytes`);
  }
  const kindSecret = hkdf(
    sha256,
    privateKey,
    utf8.encode(LOCALKEY_EXTRACT_SALT),
    utf8.encode(RAWKEY_EXTRACT_INFO),
    PRIVATE_KEY_LENGTH
  );
  return deriveReadingKeyFromSecret(kindSecret);
}

/**
 * `smartWallet` (passkey) accounts: the 32-byte WebAuthn PRF output is the
 * `kind_secret`. The caller obtains it by evaluating PRF with {@link prfSalt}
 * as `eval.first`; capability gating (PRF enabled + backup-eligible) happens at
 * passkey creation, not here.
 */
export function deriveReadingKeyFromPrfOutput(prfOutput: Uint8Array): Keypair {
  if (prfOutput.length !== PRIVATE_KEY_LENGTH) {
    throw new Error(`PRF output must be ${PRIVATE_KEY_LENGTH} bytes`);
  }
  return deriveReadingKeyFromSecret(prfOutput);
}

/** The fixed 32-byte salt passed as WebAuthn PRF `eval.first`. Public, not secret. */
export function prfSalt(): Uint8Array {
  return sha256(utf8.encode(PRF_SALT_PREIMAGE));
}
