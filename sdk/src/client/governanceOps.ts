/**
 * Governance operations mixin (MktbGovernance) for {@link MaktubClient}.
 *
 * @module
 */

import type { ContractTransactionResponse, BytesLike } from "ethers";
import type { ProposalState, VoteType } from "../types/index.js";
import type { MaktubClientConstructor } from "./base.js";

export interface IGovernanceOps {
  propose(
    targets: string[],
    values: bigint[],
    calldatas: BytesLike[],
    description: string
  ): Promise<ContractTransactionResponse>;
  castVote(
    proposalId: bigint,
    support: VoteType
  ): Promise<ContractTransactionResponse>;
  getProposalState(proposalId: bigint): Promise<ProposalState>;
}

export function GovernanceOps<TBase extends MaktubClientConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => IGovernanceOps) {
  return class extends Base {
    // ──────────────────────────────────────────────
    //  Governance (MktbGovernance)
    // ──────────────────────────────────────────────

    /**
     * Create a governance proposal.
     *
     * @param targets - Target contract addresses.
     * @param values - ETH values per action.
     * @param calldatas - Encoded function calls.
     * @param description - Human-readable proposal description.
     * @returns The transaction response.
     */
    async propose(
      targets: string[],
      values: bigint[],
      calldatas: BytesLike[],
      description: string
    ): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.governance.propose(targets, values, calldatas, description);
    }

    /**
     * Cast a vote on a governance proposal.
     *
     * @param proposalId - The proposal ID.
     * @param support - The vote type (Against=0, For=1, Abstain=2).
     * @returns The transaction response.
     */
    async castVote(
      proposalId: bigint,
      support: VoteType
    ): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.governance.castVote(proposalId, support);
    }

    /**
     * Get the state of a governance proposal.
     *
     * @param proposalId - The proposal ID.
     * @returns The proposal state.
     */
    async getProposalState(proposalId: bigint): Promise<ProposalState> {
      await this._ensureInit();
      return this.governance.getState(proposalId);
    }
  };
}
