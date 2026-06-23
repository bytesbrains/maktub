import { describe, it, expect } from "vitest";
import { ExecutorRewardsContract } from "./ExecutorRewards.js";
import { SignerRequiredError } from "../errors/index.js";

const ZERO = "0x0000000000000000000000000000000000000000";

describe("ExecutorRewardsContract", () => {
  const w = new ExecutorRewardsContract(ZERO, {} as any);

  it("exposes the underlying contract", () => {
    expect(w.contract).toBeDefined();
  });

  it("exposes all write methods as functions", () => {
    for (const m of ["stake", "unstake"] as const) {
      expect(typeof (w as any)[m]).toBe("function");
    }
  });

  it("exposes all read methods as functions", () => {
    for (const m of [
      "getStake",
      "isActiveExecutor",
      "getRewardsEarned",
      "getExecutorInfo",
      "getEmissionInfo",
      "currentRewardAmount",
      "yearlyEmission",
      "minimumStake",
      "totalStaked",
    ] as const) {
      expect(typeof (w as any)[m]).toBe("function");
    }
  });

  it("rejects write methods with SignerRequiredError when no signer is set", async () => {
    await expect(w.stake(1n)).rejects.toThrowError(SignerRequiredError);
  });
});
