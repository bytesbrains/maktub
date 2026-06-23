import { describe, it, expect } from "vitest";
import {
  encryptHybrid,
  looksLikeHybrid,
  hybridOverhead,
  maxInlineMessageBytes,
} from "./hybrid.js";
import { decryptHybridAt } from "./hybrid-decrypt.js";
import { generateKeypair } from "./keypair.js";
import { HYBRID_VERSION } from "./constants.js";

const dec = new TextDecoder();

describe("encryptHybrid / decryptHybridAt", () => {
  it("lets each of several recipients decrypt at their index", async () => {
    const kps = [
      generateKeypair(),
      generateKeypair(),
      generateKeypair(),
      generateKeypair(),
    ];
    const message = "the same letter for everyone";
    const env = await encryptHybrid(message, kps.map((k) => k.publicKey));
    for (let i = 0; i < kps.length; i++) {
      const out = await decryptHybridAt(kps[i]!.privateKey, env, i);
      expect(dec.decode(out)).toBe(message);
    }
  });

  it("throws on zero recipients", async () => {
    await expect(encryptHybrid("x", [])).rejects.toThrow(
      /at least one recipient/
    );
  });

  it("throws on an out-of-range index", async () => {
    const kp = generateKeypair();
    const env = await encryptHybrid("x", [kp.publicKey]);
    await expect(decryptHybridAt(kp.privateKey, env, 3)).rejects.toThrow(
      /out of range/
    );
  });

  it("throws on a wrong-version envelope", async () => {
    const kp = generateKeypair();
    const env = await encryptHybrid("x", [kp.publicKey]);
    const tampered = env.slice();
    tampered[0] = 0x99;
    await expect(decryptHybridAt(kp.privateKey, tampered, 0)).rejects.toThrow(
      /not a v2 hybrid envelope/
    );
  });

  it("throws on a length-mismatched envelope", async () => {
    const kp = generateKeypair();
    const env = await encryptHybrid("hello world", [kp.publicKey]);
    // Drop a few trailing bytes so total length no longer matches the header.
    const truncated = env.slice(0, env.length - 3);
    await expect(decryptHybridAt(kp.privateKey, truncated, 0)).rejects.toThrow(
      /length mismatch/
    );
  });
});

describe("looksLikeHybrid", () => {
  it("is true for a real hybrid envelope", async () => {
    const kp = generateKeypair();
    const env = await encryptHybrid("x", [kp.publicKey]);
    expect(looksLikeHybrid(env)).toBe(true);
  });

  it("is true for any buffer starting with the version byte", () => {
    expect(looksLikeHybrid(new Uint8Array([HYBRID_VERSION, 0, 0]))).toBe(true);
  });

  it("is false for a non-hybrid buffer", () => {
    expect(looksLikeHybrid(new Uint8Array([0x01, 0x02]))).toBe(false);
  });

  it("is false for an empty buffer", () => {
    expect(looksLikeHybrid(new Uint8Array(0))).toBe(false);
  });
});

describe("overhead math", () => {
  it("computes exact overhead for n=1 and n=3", () => {
    expect(hybridOverhead(1)).toBe(128);
    expect(hybridOverhead(3)).toBe(248);
  });

  it("computes exact inline budget under the default 4096 cap", () => {
    // cap - overhead(N) - PAD_HEADER_LENGTH(8) (#264 size-bucket pad frame).
    expect(maxInlineMessageBytes(1)).toBe(3960);
    expect(maxInlineMessageBytes(3)).toBe(3840);
  });

  it("clamps to zero when overhead exceeds the cap", () => {
    expect(maxInlineMessageBytes(1, 10)).toBe(0);
  });
});
