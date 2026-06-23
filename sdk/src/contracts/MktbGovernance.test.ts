import { describe, it, expect } from "vitest";
import { MktbGovernanceContract } from "./MktbGovernance.js";
import { VoteType } from "../types/index.js";
import { SignerRequiredError } from "../errors/index.js";

const ZERO = "0x0000000000000000000000000000000000000000";

describe("MktbGovernanceContract", () => {
  const w = new MktbGovernanceContract(ZERO, {} as any);

  it("exposes the underlying contract", () => {
    expect(w.contract).toBeDefined();
  });

  it("exposes all write methods as functions", () => {
    for (const m of [
      "propose",
      "castVote",
      "castVoteWithReason",
      "queue",
      "executeProposal",
    ] as const) {
      expect(typeof (w as any)[m]).toBe("function");
    }
  });

  it("exposes all read methods as functions", () => {
    for (const m of [
      "getState",
      "hasVoted",
      "getVotes",
      "votingDelay",
      "votingPeriod",
      "proposalThreshold",
      "quorum",
    ] as const) {
      expect(typeof (w as any)[m]).toBe("function");
    }
  });

  it("rejects write methods with SignerRequiredError when no signer is set", async () => {
    await expect(w.castVote(1n, VoteType.For)).rejects.toThrowError(
      SignerRequiredError
    );
  });
});
