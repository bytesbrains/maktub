/**
 * Write operations mixin for {@link MktbGovernanceContract}.
 *
 * @module
 */

import type { ContractTransactionResponse, BytesLike } from "ethers";
import { VoteType } from "../../types/index.js";
import type { MktbGovernanceConstructor } from "./base.js";

export interface IMktbGovernanceWriteOps {
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
  castVoteWithReason(
    proposalId: bigint,
    support: VoteType,
    reason: string
  ): Promise<ContractTransactionResponse>;
  queue(
    targets: string[],
    values: bigint[],
    calldatas: BytesLike[],
    descriptionHash: BytesLike
  ): Promise<ContractTransactionResponse>;
  executeProposal(
    targets: string[],
    values: bigint[],
    calldatas: BytesLike[],
    descriptionHash: BytesLike
  ): Promise<ContractTransactionResponse>;
}

export function MktbGovernanceWriteOps<TBase extends MktbGovernanceConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => IMktbGovernanceWriteOps) {
  return class extends Base implements IMktbGovernanceWriteOps {
    // ──────────────────────────────────────────────
    //  Write Functions
    // ──────────────────────────────────────────────

    /**
     * Create a new governance proposal.
     *
     * @param targets - Target contract addresses for the proposal actions.
     * @param values - ETH values for each action (typically 0).
     * @param calldatas - Encoded function calls for each action.
     * @param description - Human-readable description of the proposal.
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async propose(
      targets: string[],
      values: bigint[],
      calldatas: BytesLike[],
      description: string
    ): Promise<ContractTransactionResponse> {
      this._requireSigner("propose");
      return this.contract.getFunction("propose")(
        targets,
        values,
        calldatas,
        description
      ) as Promise<ContractTransactionResponse>;
    }

    /**
     * Cast a vote on a proposal.
     *
     * @param proposalId - The proposal ID to vote on.
     * @param support - The vote type (Against=0, For=1, Abstain=2).
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async castVote(
      proposalId: bigint,
      support: VoteType
    ): Promise<ContractTransactionResponse> {
      this._requireSigner("castVote");
      return this.contract.getFunction("castVote")(proposalId, support) as Promise<ContractTransactionResponse>;
    }

    /**
     * Cast a vote with a reason string.
     *
     * @param proposalId - The proposal ID to vote on.
     * @param support - The vote type.
     * @param reason - Human-readable reason for the vote.
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async castVoteWithReason(
      proposalId: bigint,
      support: VoteType,
      reason: string
    ): Promise<ContractTransactionResponse> {
      this._requireSigner("castVoteWithReason");
      return this.contract.getFunction("castVoteWithReason")(
        proposalId,
        support,
        reason
      ) as Promise<ContractTransactionResponse>;
    }

    /**
     * Queue a successful proposal for execution via the timelock.
     *
     * @param targets - Target contract addresses.
     * @param values - ETH values for each action.
     * @param calldatas - Encoded function calls.
     * @param descriptionHash - The keccak256 hash of the proposal description.
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async queue(
      targets: string[],
      values: bigint[],
      calldatas: BytesLike[],
      descriptionHash: BytesLike
    ): Promise<ContractTransactionResponse> {
      this._requireSigner("queue");
      return this.contract.getFunction("queue")(
        targets,
        values,
        calldatas,
        descriptionHash
      ) as Promise<ContractTransactionResponse>;
    }

    /**
     * Execute a queued proposal after the timelock delay.
     *
     * @param targets - Target contract addresses.
     * @param values - ETH values for each action.
     * @param calldatas - Encoded function calls.
     * @param descriptionHash - The keccak256 hash of the proposal description.
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async executeProposal(
      targets: string[],
      values: bigint[],
      calldatas: BytesLike[],
      descriptionHash: BytesLike
    ): Promise<ContractTransactionResponse> {
      this._requireSigner("executeProposal");
      return this.contract.getFunction("execute")(
        targets,
        values,
        calldatas,
        descriptionHash
      ) as Promise<ContractTransactionResponse>;
    }
  };
}
