/**
 * Read operations mixin for {@link MktbGovernanceContract}.
 *
 * @module
 */

import { ProposalState } from "../../types/index.js";
import type { MktbGovernanceConstructor } from "./base.js";

export interface IMktbGovernanceReadOps {
  getState(proposalId: bigint): Promise<ProposalState>;
  hasVoted(proposalId: bigint, account: string): Promise<boolean>;
  getVotes(account: string, timepoint: bigint): Promise<bigint>;
  votingDelay(): Promise<bigint>;
  votingPeriod(): Promise<bigint>;
  proposalThreshold(): Promise<bigint>;
  quorum(timepoint: bigint): Promise<bigint>;
}

export function MktbGovernanceReadOps<TBase extends MktbGovernanceConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => IMktbGovernanceReadOps) {
  return class extends Base implements IMktbGovernanceReadOps {
    // ──────────────────────────────────────────────
    //  Read Functions
    // ──────────────────────────────────────────────

    /**
     * Get the current state of a proposal.
     *
     * @param proposalId - The proposal ID.
     * @returns The proposal state enum value.
     */
    async getState(proposalId: bigint): Promise<ProposalState> {
      const state = await this.contract.getFunction("state")(proposalId) as bigint;
      return Number(state) as ProposalState;
    }

    /**
     * Check whether an account has voted on a proposal.
     *
     * @param proposalId - The proposal ID.
     * @param account - The voter address.
     * @returns True if the account has voted.
     */
    async hasVoted(proposalId: bigint, account: string): Promise<boolean> {
      return this.contract.getFunction("hasVoted")(proposalId, account) as Promise<boolean>;
    }

    /**
     * Get the voting power of an account at a specific timepoint.
     *
     * @param account - The voter address.
     * @param timepoint - The block number to check voting power at.
     * @returns The voting power.
     */
    async getVotes(account: string, timepoint: bigint): Promise<bigint> {
      return this.contract.getFunction("getVotes")(account, timepoint) as Promise<bigint>;
    }

    /**
     * Get the voting delay in blocks.
     *
     * @returns The voting delay.
     */
    async votingDelay(): Promise<bigint> {
      return this.contract.getFunction("votingDelay")() as Promise<bigint>;
    }

    /**
     * Get the voting period in blocks.
     *
     * @returns The voting period.
     */
    async votingPeriod(): Promise<bigint> {
      return this.contract.getFunction("votingPeriod")() as Promise<bigint>;
    }

    /**
     * Get the minimum MKTB required to create a proposal.
     *
     * @returns The proposal threshold in MKTB wei.
     */
    async proposalThreshold(): Promise<bigint> {
      return this.contract.getFunction("proposalThreshold")() as Promise<bigint>;
    }

    /**
     * Get the quorum required at a specific timepoint.
     *
     * @param timepoint - The block number.
     * @returns The quorum in MKTB wei.
     */
    async quorum(timepoint: bigint): Promise<bigint> {
      return this.contract.getFunction("quorum")(timepoint) as Promise<bigint>;
    }
  };
}
