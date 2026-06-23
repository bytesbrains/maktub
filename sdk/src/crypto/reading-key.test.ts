/**
 * Cross-language test vectors for reading-key derivation (#300).
 *
 * These exact bytes are the contract pinned in the reading-key spec
 * (maktub#304; canonical copy in operator-local ENCRYPTION_FORMAT.md §10.4).
 * The Dart (mobile) port MUST reproduce them byte-for-byte — a divergence
 * permanently orphans a user's letters, so this is a Critical-class invariant
 * (CISO #300). (Rust/Veil doesn't derive the key, so no Rust port is needed.)
 *
 * @module
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  deriveReadingKeyFromSeed,
  deriveReadingKeyFromPrivateKey,
  deriveReadingKeyFromPrfOutput,
  deriveReadingKeyFromSecret,
  prfSalt,
} from "./reading-key.js";

const hex = (u: Uint8Array) => Buffer.from(u).toString("hex");
const bytes = (h: string) => Uint8Array.from(Buffer.from(h, "hex"));

// ── Pinned vectors — loaded from the CANONICAL cross-language fixture ────────
// The single source of truth (maktub#304); the Dart port asserts against the
// same `vectors/reading-key.json`. No values are duplicated here.
const v = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../../vectors/reading-key.json"),
    "utf8"
  )
) as {
  vectors: {
    localKey: { seed64: string; readingSk: string; readingPk: string };
    smartWallet: { prfOutput: string; readingSk: string; readingPk: string };
    rawKey: { privateKey: string; readingSk: string; readingPk: string };
    prfSalt: string;
  };
};
const SEED64 = v.vectors.localKey.seed64;
const LOCALKEY_READING_SK = v.vectors.localKey.readingSk;
const LOCALKEY_READING_PK = v.vectors.localKey.readingPk;
const PRF_OUTPUT = v.vectors.smartWallet.prfOutput;
const SMARTWALLET_READING_SK = v.vectors.smartWallet.readingSk;
const SMARTWALLET_READING_PK = v.vectors.smartWallet.readingPk;
const PRF_SALT = v.vectors.prfSalt;
const RAWKEY_PRIV = v.vectors.rawKey.privateKey;
const RAWKEY_READING_SK = v.vectors.rawKey.readingSk;
const RAWKEY_READING_PK = v.vectors.rawKey.readingPk;

describe("reading-key derivation — pinned vectors (§8)", () => {
  it("localKey: seed → reading keypair", () => {
    const kp = deriveReadingKeyFromSeed(bytes(SEED64));
    expect(hex(kp.privateKey)).toBe(LOCALKEY_READING_SK);
    expect(hex(kp.publicKey)).toBe(LOCALKEY_READING_PK);
  });

  it("raw-hex localKey: private key → reading keypair", () => {
    const kp = deriveReadingKeyFromPrivateKey(bytes(RAWKEY_PRIV));
    expect(hex(kp.privateKey)).toBe(RAWKEY_READING_SK);
    expect(hex(kp.publicKey)).toBe(RAWKEY_READING_PK);
  });

  it("smartWallet: PRF output → reading keypair", () => {
    const kp = deriveReadingKeyFromPrfOutput(bytes(PRF_OUTPUT));
    expect(hex(kp.privateKey)).toBe(SMARTWALLET_READING_SK);
    expect(hex(kp.publicKey)).toBe(SMARTWALLET_READING_PK);
  });

  it("PRF salt is the fixed SHA-256 of the preimage", () => {
    expect(hex(prfSalt())).toBe(PRF_SALT);
  });
});

describe("reading-key derivation — invariants", () => {
  it("is deterministic (same input → same key)", () => {
    const a = deriveReadingKeyFromSeed(bytes(SEED64));
    const b = deriveReadingKeyFromSeed(bytes(SEED64));
    expect(hex(a.privateKey)).toBe(hex(b.privateKey));
  });

  it("produces a valid secp256k1 scalar and matching compressed pubkey", () => {
    const kp = deriveReadingKeyFromSecret(bytes(PRF_OUTPUT));
    expect(kp.privateKey.length).toBe(32);
    expect(kp.publicKey.length).toBe(33);
    expect(hex(secp256k1.getPublicKey(kp.privateKey, true))).toBe(
      hex(kp.publicKey)
    );
  });

  it("localKey and smartWallet secrets map to different keys", () => {
    const a = deriveReadingKeyFromSeed(bytes(SEED64));
    const b = deriveReadingKeyFromPrfOutput(bytes(PRF_OUTPUT));
    expect(hex(a.privateKey)).not.toBe(hex(b.privateKey));
  });

  it("rejects a non-32-byte secret", () => {
    expect(() => deriveReadingKeyFromSecret(new Uint8Array(31))).toThrow();
    expect(() => deriveReadingKeyFromPrfOutput(new Uint8Array(16))).toThrow();
  });
});
