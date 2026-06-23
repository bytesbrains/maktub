import { describe, it, expect } from "vitest";
import { padPlaintext, unpadPlaintext, PAD_HEADER_LENGTH } from "./padding.js";

const enc = new TextEncoder();

describe("padPlaintext / unpadPlaintext", () => {
  it("round-trips an arbitrary message", () => {
    const msg = enc.encode("apple banana cherry");
    const padded = padPlaintext(msg, 4096);
    expect(unpadPlaintext(padded)).toEqual(msg);
  });

  it("round-trips the empty message", () => {
    const padded = padPlaintext(new Uint8Array(0), 4096);
    expect(unpadPlaintext(padded)).toEqual(new Uint8Array(0));
  });

  it("pads small messages up to the smallest fitting bucket", () => {
    // 10-byte message + 8-byte header = 18 → first bucket is 64.
    expect(padPlaintext(enc.encode("0123456789"), 4096).length).toBe(64);
    // 300-byte message + 8 = 308 → 512 bucket.
    expect(padPlaintext(new Uint8Array(300), 4096).length).toBe(512);
  });

  it("collapses different sizes into the same bucket (size is hidden)", () => {
    const a = padPlaintext(enc.encode("hi"), 4096).length;
    const b = padPlaintext(new Uint8Array(50), 4096).length;
    expect(a).toBe(b); // both land in the 64 bucket
  });

  it("pads to the budget when no bucket fits below it", () => {
    // 150 + 8 = 158 framed; the next bucket (256) exceeds the 220 budget, so
    // the message is padded to the budget itself rather than overflowing it.
    expect(padPlaintext(new Uint8Array(150), 220).length).toBe(220);
  });

  it("frames (no bucket padding) when the message exceeds the budget", () => {
    // Too large to inline → framed only, so the caller spills it off-chain.
    // 100 + 8 = 108, budget 50 → padded length is exactly the framed length.
    const padded = padPlaintext(new Uint8Array(100), 50);
    expect(padded.length).toBe(108);
    expect(unpadPlaintext(padded)).toEqual(new Uint8Array(100));
  });

  it("round-trips a message larger than a uint16 length field", () => {
    const big = new Uint8Array(70000).fill(7);
    const padded = padPlaintext(big, 4096); // over budget → frame only
    expect(unpadPlaintext(padded)).toEqual(big);
  });

  it("leaves a non-framed (legacy) plaintext unchanged", () => {
    const legacy = enc.encode("a plain pre-padding letter");
    expect(unpadPlaintext(legacy)).toEqual(legacy);
  });

  it("leaves a buffer shorter than the header unchanged", () => {
    const tiny = Uint8Array.of(0x4d, 0x4b);
    expect(unpadPlaintext(tiny)).toEqual(tiny);
  });

  it("ignores a frame whose declared length overruns the buffer", () => {
    // Valid magic+version but true_len points past the end → treat as legacy.
    const spoofed = new Uint8Array(PAD_HEADER_LENGTH + 2);
    spoofed.set([0x4d, 0x4b, 0x50, 0x01, 0x00, 0x00, 0xff, 0xff]); // len ~65535
    expect(unpadPlaintext(spoofed)).toEqual(spoofed);
  });
});
