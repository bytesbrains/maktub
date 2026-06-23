import { describe, it, expect } from "vitest";
import { Interface } from "ethers";
import {
  MAKTUB_CORE_ABI,
  RECIPIENT_REGISTRY_ABI,
  MKTB_TOKEN_ABI,
  EXECUTOR_REWARDS_ABI,
  MKTB_GOVERNANCE_ABI,
  RECIPIENT_REGISTRY_V2_ABI,
  MAKTUB_FLASH_ABI,
} from "./abis.js";

const ABIS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["MAKTUB_CORE_ABI", MAKTUB_CORE_ABI],
  ["RECIPIENT_REGISTRY_ABI", RECIPIENT_REGISTRY_ABI],
  ["MKTB_TOKEN_ABI", MKTB_TOKEN_ABI],
  ["EXECUTOR_REWARDS_ABI", EXECUTOR_REWARDS_ABI],
  ["MKTB_GOVERNANCE_ABI", MKTB_GOVERNANCE_ABI],
  ["RECIPIENT_REGISTRY_V2_ABI", RECIPIENT_REGISTRY_V2_ABI],
  ["MAKTUB_FLASH_ABI", MAKTUB_FLASH_ABI],
];

describe("constants/abis", () => {
  it("exports all 7 ABIs", () => {
    expect(ABIS).toHaveLength(7);
  });

  for (const [name, abi] of ABIS) {
    describe(name, () => {
      it("is a non-empty array", () => {
        expect(Array.isArray(abi)).toBe(true);
        expect(abi.length).toBeGreaterThan(0);
      });

      it("constructs a valid ethers Interface", () => {
        expect(() => new Interface(abi as any)).not.toThrow();
      });
    });
  }
});
