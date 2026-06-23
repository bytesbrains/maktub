import { describe, it, expect } from "vitest";
import { MaktubClient } from "./MaktubClient.js";

// No addresses → constructor skips contract init; no network is ever touched.
function makeClient(): MaktubClient {
  return new MaktubClient({ provider: {} as any });
}

const PUBLIC_METHODS = [
  // base
  "init",
  // heartbeat
  "createHeartbeat",
  "checkIn",
  "execute",
  "updateRecipients",
  "updateInterval",
  "deactivate",
  "getHeartbeat",
  "isExpired",
  "timeRemaining",
  "heartbeatCount",
  "ownerBeatCount",
  "getOwnerBeats",
  "getOwnerBeatsPaged",
  "inboxCount",
  "getInboxBeats",
  "getInboxBeatsPaged",
  "beatId",
  "creationFeeFor",
  // recipient
  "registerRecipient",
  "updatePrePublicKey",
  "isRecipientRegistered",
  "getPrePublicKey",
  // executor
  "stakeForExecution",
  "unstake",
  "isActiveExecutor",
  "getExecutorInfo",
  "getEmissionInfo",
  // token
  "balanceOf",
  "approve",
  "delegateVotes",
  "getTokenInfo",
  // governance
  "propose",
  "castVote",
  "getProposalState",
  // crypto
  "generateRecipientKey",
  "publicKeyFor",
  "encryptForRecipients",
  "encryptForRegisteredRecipients",
  "decryptMyBlob",
  "inspectBundle",
  "bytesToHex",
  // flash
  "flash",
  "flashFeeFor",
  "getFlash",
  "getSentFlashes",
  "getReceivedFlashes",
  "isFlashEligible",
  "registerV2",
  "enableFlash",
  "disableFlash",
] as const;

describe("MaktubClient composition", () => {
  it("exposes every public method", () => {
    const client = makeClient();
    for (const name of PUBLIC_METHODS) {
      expect(typeof (client as any)[name]).toBe("function");
    }
  });

  it("asserts the full public method count", () => {
    expect(PUBLIC_METHODS.length).toBe(51);
  });

  it("keeps the public fields", () => {
    const client = makeClient();
    expect(client.provider).toBeDefined();
    expect(client.signer).toBeUndefined();
  });
});

describe("init()", () => {
  it("detects the network only once under concurrent init() calls", async () => {
    let getNetworkCalls = 0;
    // Base Sepolia (84532) is a known network in the built-in registry, so
    // address resolution succeeds without addresses passed to the constructor.
    const provider = {
      getNetwork: async () => {
        getNetworkCalls++;
        return { chainId: 84532n };
      },
    };
    const client = new MaktubClient({ provider: provider as any });

    await Promise.all([client.init(), client.init(), client.init()]);

    expect(getNetworkCalls).toBe(1);
    expect(client.core).toBeDefined();
  });
});

describe("network-free crypto methods", () => {
  it("round-trips an ECIES bundle", async () => {
    const client = makeClient();
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const plaintext = enc.encode("it is written");

    const kp = client.generateRecipientKey();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);

    // publicKeyFor derives the same public key from the private key.
    const derived = client.publicKeyFor(kp.privateKey);
    expect(client.bytesToHex(derived)).toBe(client.bytesToHex(kp.publicKey));

    const bundle = await client.encryptForRecipients(plaintext, [kp.publicKey]);

    const info = client.inspectBundle(bundle);
    expect(info).toEqual({ version: 1, count: 1 });

    const recovered = await client.decryptMyBlob(bundle, kp.privateKey, 0);
    expect(dec.decode(recovered)).toBe("it is written");
  });

  it("bytesToHex produces a 0x-prefixed hex string", () => {
    const client = makeClient();
    expect(client.bytesToHex(new Uint8Array([0xab, 0xcd]))).toBe("0xabcd");
  });
});
