import { describe, it, expect } from "vitest";
import { generateKeypair, publicKeyFromPrivate } from "./keypair.js";
import {
  COMPRESSED_PUBKEY_LENGTH,
  UNCOMPRESSED_PUBKEY_LENGTH,
  PRIVATE_KEY_LENGTH,
} from "./constants.js";

describe("generateKeypair", () => {
  it("returns a 33-byte compressed pub and 32-byte priv", () => {
    const kp = generateKeypair();
    expect(kp.publicKey.length).toBe(COMPRESSED_PUBKEY_LENGTH);
    expect(kp.privateKey.length).toBe(PRIVATE_KEY_LENGTH);
  });

  it("produces distinct keypairs on each call", () => {
    const a = generateKeypair();
    const b = generateKeypair();
    expect(a.privateKey).not.toEqual(b.privateKey);
  });
});

describe("publicKeyFromPrivate", () => {
  it("matches the public key produced at generation time", () => {
    const kp = generateKeypair();
    expect(publicKeyFromPrivate(kp.privateKey)).toEqual(kp.publicKey);
  });

  it("can return the uncompressed form", () => {
    const kp = generateKeypair();
    const uncompressed = publicKeyFromPrivate(kp.privateKey, false);
    expect(uncompressed.length).toBe(UNCOMPRESSED_PUBKEY_LENGTH);
  });

  it("throws on a wrong-length private key", () => {
    expect(() => publicKeyFromPrivate(new Uint8Array(31))).toThrow(
      /invalid secp256k1 private key length/
    );
  });
});
