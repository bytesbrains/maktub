# Proposal Process

A practical, step-by-step walkthrough of creating, voting on, and executing a governance proposal.

For the high-level picture, see [Governance Overview](./overview.md).

---

## Table of contents

1. [Preconditions](#1-preconditions)
2. [Step 1: Draft](#2-step-1-draft)
3. [Step 2: Submit on-chain](#3-step-2-submit-on-chain)
4. [Step 3: Voting delay](#4-step-3-voting-delay)
5. [Step 4: Voting](#5-step-4-voting)
6. [Step 5: Queue](#6-step-5-queue)
7. [Step 6: Execute](#7-step-6-execute)
8. [Example: raise the executor minimumStake](#8-example-raise-the-executor-minimumstake)
9. [Example: spend from the treasury](#9-example-spend-from-the-treasury)
10. [Cancellations and expiries](#10-cancellations-and-expiries)

---

## 1. Preconditions

To submit a proposal you need:

- A wallet with voting power ≥ `proposalThreshold` (default 100,000 MKTB)
- The MKTB delegated (to yourself or through accumulated delegation)
- A clear idea of what the proposal should do

Voting power is measured at the **proposal block**. If you delegate today, you can propose immediately.

For all other participants (voters), the preconditions are simpler: hold MKTB, delegate.

## 2. Step 1: Draft

Successful proposals begin off-chain.

- **Forum post.** Describe the problem, the proposed solution, and the expected effect. Share the specific on-chain calls you intend to propose (target addresses, function signatures, calldata).
- **Community discussion.** Most proposals go through at least one revision based on feedback. Budget a week or more.
- **Simulation.** For any non-trivial proposal, simulate on a fork node. This is the easiest way to catch errors that would otherwise waste a 7-day voting cycle.
- **Final proposal text.** Lock the description, targets, values, and calldata. Compute and share the `descriptionHash` so reviewers can verify it matches what will be submitted.

## 3. Step 2: Submit on-chain

Call `MktbGovernance.propose(targets, values, calldatas, description)`.

```typescript
import { MaktubClient } from "@bytesbrains/maktub-sdk";
import { AbiCoder, id } from "ethers";

const functionSelector = id("setMinimumStake(uint256)").slice(0, 10);
const argEncoded = new AbiCoder().encode(["uint256"], [500_000n * 10n ** 18n]);
const calldata = functionSelector + argEncoded.slice(2);

const tx = await maktub.propose(
  [executorRewardsAddress],
  [0n],
  [calldata],
  "Raise executor minimumStake to 500,000 MKTB for mainnet economics"
);
const receipt = await tx.wait();
```

The transaction emits `ProposalCreated(proposalId, proposer, targets, values, signatures, calldatas, voteStart, voteEnd, description)`. Extract the `proposalId` for all subsequent operations.

## 4. Step 3: Voting delay

After creation, the proposal is in the `Pending` state until the voting delay elapses. Default: 1 day.

Use this window to:

- Announce on all community channels
- Answer questions in the forum
- Publish a simulation showing the exact before/after state changes
- Highlight any nuance in the calldata that reviewers should verify

## 5. Step 4: Voting

Voting opens when `state(proposalId) == Active`.

```typescript
import { VoteType } from "@bytesbrains/maktub-sdk";

await maktub.castVote(proposalId, VoteType.For);      // support
await maktub.castVote(proposalId, VoteType.Against);  // oppose
await maktub.castVote(proposalId, VoteType.Abstain);  // counts toward quorum
```

Vote once per proposal per delegated address. Cannot change your vote after casting.

If you have delegated to someone else, you cannot vote directly — your delegate votes for you. Re-delegating mid-vote does not retroactively move your power; the snapshot was taken at the proposal block.

**Quorum:** `For + Abstain >= 4% of total MKTB supply` at the snapshot block.

**Passage:** `For > Against` **AND** quorum met.

Voting period ends at `voteEnd`. Default: 7 days after `voteStart`.

## 6. Step 5: Queue

A successful proposal is in the `Succeeded` state. It must be queued in the timelock before it can execute:

```typescript
await maktub.governance.contract.queue(
  targets,
  values,
  calldatas,
  descriptionHash   // keccak256 of the description string
);
```

Anyone can queue. The proposer does not have to do it personally.

If the proposal is not queued within the timelock's grace period (typically 14 days), it expires and cannot be executed. Queue promptly.

## 7. Step 6: Execute

After the timelock delay (default 2 days), the proposal can be executed:

```typescript
await maktub.governance.contract.execute(
  targets,
  values,
  calldatas,
  descriptionHash
);
```

Again, anyone can execute. The timelock makes the actual state changes on-chain — the target contract sees `msg.sender == timelockAddress`.

After execution, `state(proposalId) == Executed`. The proposal is finalized and immutable.

## 8. Example: raise the executor minimumStake

Full worked example.

**Goal:** change the executor minimum stake from 1,000 MKTB to 500,000 MKTB for mainnet.

**Target:** `ExecutorRewards.setMinimumStake(uint256)`

**Draft (forum):**

> **Proposal: Raise executor minimumStake to 500,000 MKTB**
>
> **Summary.** We are launching on Base mainnet in two weeks. The current minimumStake of 1,000 MKTB is too low to provide meaningful Sybil resistance at mainnet scale. We propose raising it to 500,000 MKTB.
>
> **Target:** `ExecutorRewards` at `0xAAAA...`
> **Function:** `setMinimumStake(uint256)`
> **Argument:** `500000 * 1e18`
>
> **Calldata:** `0x...`
> **Description:** "Raise executor minimumStake to 500,000 MKTB for mainnet economics"
> **Description hash:** `0x...`
>
> **Expected effects.** Current Sepolia executors will become inactive at mainnet deploy. They can re-stake if they wish to continue. Expected mainnet executor count: 10-30 in the first year.
>
> **Rationale.** ... (detailed rationale, simulation links, etc.)

**Submit:**

```typescript
const targets = ["0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba"]; // ExecutorRewards
const values = [0n];
const calldatas = ["0x..."]; // function selector + 0x...500_000e18
const description = "Raise executor minimumStake to 500,000 MKTB for mainnet economics";

const tx = await maktub.propose(targets, values, calldatas, description);
const receipt = await tx.wait();
// extract proposalId from ProposalCreated event
```

**Vote:** delegates cast For/Against/Abstain over 7 days.

**Queue:**

```typescript
import { keccak256, toUtf8Bytes } from "ethers";
const descriptionHash = keccak256(toUtf8Bytes(description));
await maktub.governance.contract.queue(targets, values, calldatas, descriptionHash);
```

**Execute (after 2 days):**

```typescript
await maktub.governance.contract.execute(targets, values, calldatas, descriptionHash);
```

After execution, `ExecutorRewards.minimumStake()` returns `500_000 * 10**18`.

## 9. Example: spend from the treasury

**Goal:** fund a security audit from the community treasury (25M MKTB holding, plus any ETH).

**Target:** the treasury wallet (controlled by the timelock). Transfer treasury funds — MKTB or ETH — to the audit firm's address.

**Calldata:** for an MKTB-denominated grant, `MktbToken.transfer(auditFirmAddress, amountInMktb)`; for ETH, the proposal sets a non-zero `value` on a call to the audit firm's address.

**Why two steps?** The treasury is typically a multisig owned by the timelock. The proposal executes a call *from* the timelock *to* the multisig to initiate the transfer. Alternatively the treasury can be held directly in a timelock-owned address — in which case the proposal makes the transfer call directly.

**Rationale requirements:** auditors should be named, scope of audit defined, deliverables specified, payment terms clear. Treasury proposals are under extra scrutiny because they move real value.

## 10. Cancellations and expiries

**Cancellations.** The proposer can cancel their own proposal at any time before execution. The governor admin (the timelock) can also cancel. After cancellation, `state == Canceled` and the proposal is finalized.

**Expiries.** A Succeeded proposal that is not queued within the Governor's grace period, or a Queued proposal that is not executed within the timelock's grace period, transitions to `Expired`. Expired proposals must be re-submitted if still desired.

**Defeated proposals.** Cannot be re-submitted identically with the same descriptionHash (the Governor tracks proposal ids derived from the targets/values/calldatas/descriptionHash tuple). To re-propose, change the description.

---

## Related reading

- [Governance Overview](./overview.md)
- [Current Parameters](./parameters.md)
- [SDK Reference](../developer/sdk.md)

