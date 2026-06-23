/**
 * AES-256-GCM shim (WebCrypto when available, else node:crypto) and
 * randomness helper for the ECIES encryption layer.
 *
 * @module
 */

import { TAG_LENGTH } from "./constants.js";

// ─────────────────────────────────────────────────────────────
//  AES-256-GCM shim (WebCrypto when available, else node:crypto)
// ─────────────────────────────────────────────────────────────

interface GcmOutput {
  ciphertext: Uint8Array;
  tag: Uint8Array;
}

export async function aesGcmEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array
): Promise<GcmOutput> {
  // Browsers + modern Node (>=19) have globalThis.crypto.subtle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtle = (globalThis as { crypto?: { subtle?: any } }).crypto?.subtle;
  if (subtle) {
    const ck = await subtle.importKey(
      "raw",
      key,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    const ct = new Uint8Array(
      await subtle.encrypt(
        { name: "AES-GCM", iv, tagLength: TAG_LENGTH * 8 },
        ck,
        plaintext
      )
    );
    // WebCrypto appends the tag at the end of ciphertext.
    const ciphertext = ct.slice(0, ct.length - TAG_LENGTH);
    const tag = ct.slice(ct.length - TAG_LENGTH);
    return { ciphertext, tag };
  }
  // Node fallback (synchronous)
  const nodeCrypto = await loadNodeCrypto();
  const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: new Uint8Array(ct), tag: new Uint8Array(tag) };
}

export async function aesGcmDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array
): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtle = (globalThis as { crypto?: { subtle?: any } }).crypto?.subtle;
  if (subtle) {
    const ck = await subtle.importKey(
      "raw",
      key,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);
    const pt = await subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: TAG_LENGTH * 8 },
      ck,
      combined
    );
    return new Uint8Array(pt);
  }
  const nodeCrypto = await loadNodeCrypto();
  const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(Buffer.from(tag));
  const pt = Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
  return new Uint8Array(pt);
}

interface NodeCryptoModule {
  createCipheriv: (
    alg: string,
    key: Uint8Array,
    iv: Uint8Array
  ) => {
    update: (data: Uint8Array | Buffer) => Buffer;
    final: () => Buffer;
    getAuthTag: () => Buffer;
  };
  createDecipheriv: (
    alg: string,
    key: Uint8Array,
    iv: Uint8Array
  ) => {
    update: (data: Uint8Array | Buffer) => Buffer;
    final: () => Buffer;
    setAuthTag: (tag: Buffer) => void;
  };
  randomBytes: (n: number) => Buffer;
}

let _nodeCrypto: NodeCryptoModule | undefined;
async function loadNodeCrypto(): Promise<NodeCryptoModule> {
  if (_nodeCrypto) return _nodeCrypto;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = (await import("crypto")) as unknown as NodeCryptoModule;
  _nodeCrypto = mod;
  return mod;
}

// ─────────────────────────────────────────────────────────────
//  Randomness
// ─────────────────────────────────────────────────────────────

export function randomBytes(n: number): Uint8Array {
  const g = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto;
  if (g?.getRandomValues) {
    const out = new Uint8Array(n);
    g.getRandomValues(out);
    return out;
  }
  // `globalThis.crypto` is standard in all modern targets (browsers, Node 18+).
  // There is no safe synchronous fallback in a native ESM context (`require` is
  // undefined there), so fail loudly rather than silently weakening randomness.
  throw new Error("randomBytes: globalThis.crypto.getRandomValues is not available");
}
