import { describe, it, expect } from "vitest";
import { encryptBundle, parseBundle, decryptBundleAt } from "./bundle.js";
import { generateKeypair } from "./keypair.js";

const dec = new TextDecoder();

describe("encryptBundle / decryptBundleAt", () => {
  it("lets each recipient decrypt at their own index", async () => {
    const kps = [generateKeypair(), generateKeypair(), generateKeypair()];
    const message = "shared secret";
    const bundle = await encryptBundle(
      message,
      kps.map((k) => k.publicKey)
    );
    for (let i = 0; i < kps.length; i++) {
      const out = await decryptBundleAt(bundle, kps[i]!.privateKey, i);
      expect(dec.decode(out)).toBe(message);
    }
  });

  it("parseBundle reports the correct blob count and version", async () => {
    const kps = [generateKeypair(), generateKeypair()];
    const bundle = await encryptBundle("hi", kps.map((k) => k.publicKey));
    const { version, blobs } = parseBundle(bundle);
    expect(version).toBe(0x01);
    expect(blobs.length).toBe(2);
  });

  it("throws when there are zero recipients", async () => {
    await expect(encryptBundle("x", [])).rejects.toThrow(
      /at least one recipient/
    );
  });

  it("throws on an out-of-range index", async () => {
    const kp = generateKeypair();
    const bundle = await encryptBundle("x", [kp.publicKey]);
    await expect(decryptBundleAt(bundle, kp.privateKey, 5)).rejects.toThrow(
      /out of range/
    );
  });

  it("throws on a truncated bundle", async () => {
    const kp = generateKeypair();
    const bundle = await encryptBundle("x", [kp.publicKey]);
    const truncated = bundle.slice(0, bundle.length - 5);
    expect(() => parseBundle(truncated)).toThrow(/truncated/);
  });

  it("a different recipient cannot decrypt another's slot", async () => {
    const kps = [generateKeypair(), generateKeypair()];
    const bundle = await encryptBundle("x", kps.map((k) => k.publicKey));
    // recipient 1 trying to read slot 0 should fail authentication.
    await expect(decryptBundleAt(bundle, kps[1]!.privateKey, 0)).rejects.toThrow();
  });
});
