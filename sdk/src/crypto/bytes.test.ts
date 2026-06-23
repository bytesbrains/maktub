import { describe, it, expect } from "vitest";
import { hexToBytes, bytesToHex, coerceBytes } from "./bytes.js";

describe("hex helpers", () => {
  it("round-trips bytes to hex and back", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0xab, 0xff, 0x10]);
    const hex = bytesToHex(bytes);
    expect(hex).toBe("0x0001abff10");
    expect(hexToBytes(hex)).toEqual(bytes);
  });

  it("parses hex with and without the 0x prefix identically", () => {
    expect(hexToBytes("0xdeadbeef")).toEqual(hexToBytes("deadbeef"));
  });

  it("handles the empty string", () => {
    expect(hexToBytes("0x")).toEqual(new Uint8Array(0));
    expect(hexToBytes("")).toEqual(new Uint8Array(0));
  });

  it("throws on odd-length hex", () => {
    expect(() => hexToBytes("0xabc")).toThrow(/odd length/);
  });

  it("throws on invalid hex characters", () => {
    expect(() => hexToBytes("0xzz")).toThrow(/invalid hex string/);
  });
});

describe("coerceBytes", () => {
  it("returns Uint8Array inputs unchanged", () => {
    const b = new Uint8Array([1, 2, 3]);
    expect(coerceBytes(b)).toBe(b);
  });

  it("parses a 0x-prefixed string as hex", () => {
    expect(coerceBytes("0x0102")).toEqual(new Uint8Array([0x01, 0x02]));
  });

  it("parses an even-length all-hex string as hex", () => {
    // "abcd" is valid hex of even length -> parsed as hex, not utf8.
    expect(coerceBytes("abcd")).toEqual(new Uint8Array([0xab, 0xcd]));
  });

  it("encodes non-hex text as utf-8", () => {
    expect(coerceBytes("hello")).toEqual(new TextEncoder().encode("hello"));
  });

  it("encodes odd-length text as utf-8", () => {
    // "abc" is hex-valid but odd length -> falls through to utf-8.
    expect(coerceBytes("abc")).toEqual(new TextEncoder().encode("abc"));
  });
});
