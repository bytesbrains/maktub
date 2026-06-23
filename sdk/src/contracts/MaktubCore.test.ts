import { describe, it, expect } from "vitest";
import { AbiCoder, keccak256 } from "ethers";
import { MaktubCoreContract } from "./MaktubCore.js";
import { beatId } from "./maktubCore/writeOps.js";
import { SignerRequiredError } from "../errors/index.js";

const ZERO = "0x0000000000000000000000000000000000000000";

describe("MaktubCoreContract", () => {
  const w = new MaktubCoreContract(ZERO, {} as any);

  it("exposes the underlying contract", () => {
    expect(w.contract).toBeDefined();
  });

  it("exposes all write methods as functions", () => {
    for (const m of [
      "createHeartbeat",
      "checkIn",
      "execute",
      "updateRecipients",
      "updateInterval",
      "deactivate",
    ] as const) {
      expect(typeof (w as any)[m]).toBe("function");
    }
  });

  it("exposes all read methods as functions", () => {
    for (const m of [
      "getHeartbeat",
      "isExpired",
      "timeRemaining",
      "isExecutor",
      "heartbeatCount",
      "ownerBeatCount",
      "getOwnerBeats",
      "getOwnerBeatsPaged",
      "inboxCount",
      "getInboxBeats",
      "getInboxBeatsPaged",
      "creationFeeFor",
      "baseFee",
      "perAdditionalFee",
      "feeReceiver",
      "minInterval",
      "maxInterval",
      "maxRecipients",
    ] as const) {
      expect(typeof (w as any)[m]).toBe("function");
    }
  });

  it("rejects write methods with SignerRequiredError when no signer is set", async () => {
    await expect(w.checkIn(1)).rejects.toThrowError(SignerRequiredError);
  });
});

describe("beatId (D-038 deterministic ID derivation)", () => {
  const sender = "0x1111111111111111111111111111111111111111";
  const salt = "0x" + "ab".repeat(32);

  it("matches the contract formula keccak256(abi.encode(sender, salt))", () => {
    const expected = BigInt(
      keccak256(
        AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [sender, salt])
      )
    );
    expect(beatId(sender, salt)).toBe(expected);
  });

  it("accepts a Uint8Array salt and is deterministic", () => {
    const bytes = new Uint8Array(32).fill(0xab);
    expect(beatId(sender, bytes)).toBe(beatId(sender, salt));
  });

  it("differs for a different salt", () => {
    const other = "0x" + "cd".repeat(32);
    expect(beatId(sender, other)).not.toBe(beatId(sender, salt));
  });
});
