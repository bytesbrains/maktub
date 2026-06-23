/**
 * Governance enums for the Maktub Protocol SDK.
 *
 * @module
 */

/** Governance proposal state, matching OpenZeppelin Governor.ProposalState enum. */
export enum ProposalState {
  Pending = 0,
  Active = 1,
  Canceled = 2,
  Defeated = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}

/** Vote type for governance proposals. */
export enum VoteType {
  Against = 0,
  For = 1,
  Abstain = 2,
}
