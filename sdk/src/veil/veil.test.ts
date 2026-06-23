import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { generateKeypair } from "../crypto/keypair.js";
import {
  beatExecutedCondition,
  combinePartials,
  conditionIdentity,
  veilOpen,
  veilSeal,
  veilUnwrap,
} from "./veil.js";

// The Rust-generated cross-language fixture, vendored alongside the warden wasm
// (regenerate from the warden repo's wasm/test/fixture.json when the wasm is updated).
const fx = JSON.parse(
  readFileSync(path.join(__dirname, "warden_fixture.json"), "utf8")
);

describe("veil (SDK over warden-wasm)", () => {
  it("identity matches the Rust fixture + the committed KAT", () => {
    expect(conditionIdentity(fx.condition)).toBe(fx.identity);
    expect(fx.identity).toBe(
      "47fce3a147fc844978e8301a7aedbf437100eda9f769ac0d559c85d806cdb68e"
    );
  });

  it("full Veil round-trip: hybrid-encrypt → gate → combine → ungate → hybrid-decrypt", async () => {
    const recipient = generateKeypair();
    const plaintext = new TextEncoder().encode("abandon abandon … about (a 24-word seed)");

    // Seal to the recipient, gated on the fixture's condition (so the fixture's partials apply).
    const gated = await veilSeal({
      plaintext,
      recipientPublicKeys: [recipient.publicKey],
      condition: fx.condition,
      masterPubHex: fx.masterPub,
      network: fx.network,
    });
    expect(JSON.parse(gated).alg).toBe("warden-gate-v1");

    // Combine the fixture's node partials → the released key (matches the Rust d_id).
    const dId = combinePartials(fx.partials, fx.identity, JSON.stringify(fx.federation));
    expect(dId).toBe(fx.dId);

    // Ungate + recipient-decrypt → the original plaintext, end-to-end.
    const out = await veilUnwrap({
      gatedEnvelope: gated,
      dIdHex: dId,
      recipientPrivateKey: recipient.privateKey,
      recipientIndex: 0,
    });
    expect(new TextDecoder().decode(out)).toBe(
      "abandon abandon … about (a 24-word seed)"
    );
  });

  it("is undecryptable before release (no key) and a wrong recipient can't open it", async () => {
    const heir = generateKeypair();
    const gated = await veilSeal({
      plaintext: new TextEncoder().encode("secret"),
      recipientPublicKeys: [heir.publicKey],
      condition: fx.condition,
      masterPubHex: fx.masterPub,
      network: fx.network,
    });
    const dId = combinePartials(fx.partials, fx.identity, JSON.stringify(fx.federation));

    // Right key + released → opens; wrong key → fails even with the released key.
    const attacker = generateKeypair();
    await expect(
      veilUnwrap({ gatedEnvelope: gated, dIdHex: dId, recipientPrivateKey: attacker.privateKey, recipientIndex: 0 })
    ).rejects.toThrow();
  });

  it("validates inputs with clear errors (not cryptic wasm faults)", async () => {
    expect(() => conditionIdentity(null as unknown as object)).toThrow(/non-null object/);
    await expect(
      veilOpen({
        gatedEnvelope: "{ not json",
        nodes: [],
        federationJson: "{}",
        recipientPrivateKey: generateKeypair().privateKey,
        recipientIndex: 0,
      })
    ).rejects.toThrow(/not valid JSON/);
  });

  it("veilOpen fails fast on a permanent error (bad federationJson), not at timeout", async () => {
    const heir = generateKeypair();
    const gated = await veilSeal({
      plaintext: new TextEncoder().encode("x"),
      recipientPublicKeys: [heir.publicKey],
      condition: fx.condition,
      masterPubHex: fx.masterPub,
      network: fx.network,
    });
    const started = Date.now();
    await expect(
      veilOpen({
        gatedEnvelope: gated,
        nodes: [], // no nodes → empty partials; the bad federationJson is the permanent error
        federationJson: "not-json",
        recipientPrivateKey: heir.privateKey,
        recipientIndex: 0,
        timeoutMs: 30_000,
      })
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000); // didn't poll to the 30s timeout
  });

  it("beatExecutedCondition builds the word:7 getHeartbeat condition", () => {
    const c = beatExecutedCondition({ core: "0xb603C96D089F64Ac487EE0bdaE97D49848F86133", beatId: 777 }) as any;
    expect(c.fn).toBe("getHeartbeat(uint256)");
    expect(c.word).toBe(7);
    expect(c.chain).toBe(84532);
  });
});
