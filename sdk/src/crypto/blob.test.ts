import { describe, it, expect } from "vitest";
import { encryptBlob, decryptBlob } from "./blob.js";
import { generateKeypair } from "./keypair.js";
import {
  UNCOMPRESSED_PUBKEY_LENGTH,
  IV_LENGTH,
  TAG_LENGTH,
} from "./constants.js";

const dec = new TextDecoder();

describe("encryptBlob / decryptBlob", () => {
  it("round-trips a plaintext for the holder of the private key", async () => {
    const kp = generateKeypair();
    const message = "the meeting is at noon";
    const blob = await encryptBlob(kp.publicKey, message);
    const out = await decryptBlob(kp.privateKey, blob);
    expect(dec.decode(out)).toBe(message);
  });

  it("round-trips empty plaintext", async () => {
    const kp = generateKeypair();
    const blob = await encryptBlob(kp.publicKey, new Uint8Array(0));
    const out = await decryptBlob(kp.privateKey, blob);
    expect(out.length).toBe(0);
  });

  it("throws on a too-short blob", async () => {
    const kp = generateKeypair();
    const tooShort = new Uint8Array(
      UNCOMPRESSED_PUBKEY_LENGTH + IV_LENGTH + TAG_LENGTH - 1
    );
    await expect(decryptBlob(kp.privateKey, tooShort)).rejects.toThrow(
      /blob too short/
    );
  });

  it("fails to decrypt with the wrong private key", async () => {
    const recipient = generateKeypair();
    const attacker = generateKeypair();
    const blob = await encryptBlob(recipient.publicKey, "secret");
    await expect(decryptBlob(attacker.privateKey, blob)).rejects.toThrow();
  });
});
