# Governance Overview

How the Maktub Protocol is governed, what governance can and cannot change, and how to participate.

Maktub uses on-chain governance via the **MKTB token**. Token holders delegate voting power, propose parameter changes, and vote. Executed proposals flow through a **TimelockController** that enforces a delay between success and execution — a safety margin for the community to react if a proposal turns out to be malicious.

The key design constraint: **governance can change the periphery, not the core.**

---

## Table of contents

1. [Design philosophy](#1-design-philosophy)
2. [What governance controls](#2-what-governance-controls)
3. [What governance does not control](#3-what-governance-does-not-control)
4. [Voting power](#4-voting-power)
5. [Delegation](#5-delegation)
6. [Proposal lifecycle](#6-proposal-lifecycle)
7. [The timelock](#7-the-timelock)
8. [Participation in practice](#8-participation-in-practice)

---

## 1. Design philosophy

Two principles shaped the governance design.

**Immutable core.** The contracts that enforce the heartbeat primitive (`MaktubCore`, `RecipientRegistry`, `MktbToken`) have no admin, no pause, no upgrade path. This means:

- No governance vote can change how a heartbeat works.
- No governance vote can drain user funds (there are none held on behalf of users).
- No governance vote can pause an in-flight heartbeat.

**Governable periphery.** The contracts that tune the economy (`ExecutorRewards`, `MktbGovernance`) are upgradeable through governance. This means:

- Governance can tune the executor network's economics.
- Governance can allocate the community treasury.
- Governance can evolve its own parameters (voting delay, period, quorum).

This split is the structural commitment Maktub makes to users: **users trust math, not governance.** Your heartbeats are governed by code that will never change. The surrounding economy can evolve with community consensus.

## 2. What governance controls

Governance proposals can execute arbitrary on-chain calls from the timelock address. In practice, proposals affect:

- **Executor parameters** on `ExecutorRewards`:
    - `setMinimumStake(uint256)` — the stake threshold for active executor status
    - `setRewardPerExecution(uint256)` — per-execution MKTB reward (capped at 10× initial)
    - `pause()` / `unpause()` — emergency halt of reward distribution
    - `slash(address executor, uint256 amount, string reason)` — confiscation for proven misbehavior
- **Governance meta-parameters** on `MktbGovernance` itself:
    - Voting delay
    - Voting period
    - Proposal threshold
    - Quorum fraction
- **Treasury operations.** The community treasury (25% of MKTB = 25M) can be moved and spent via timelock-executed calls.
- **Ecosystem grants.** The ecosystem allocation (10% of MKTB) can be distributed via timelock-executed calls.
- **Deployment of new peripheral modules.** Governance can introduce new contracts that extend the protocol — e.g., an insurance module, an alternative reward distributor, a price oracle for the creation fee.

## 3. What governance does not control

Hard-coded in immutable bytecode or immutable state:

- **MaktubCore logic.** `createHeartbeat`, `checkIn`, `execute`, `updateRecipients`, `updateInterval`, `deactivate` — none of these can be modified. Every heartbeat already on-chain keeps executing by exactly the rules it was created under.
- **MaktubCore constants.** `MIN_INTERVAL = 1 hour`, `MAX_INTERVAL = 365 days`, `MAX_RECIPIENTS = 50` — all immutable.
- **`creationFee`.** Set at `MaktubCore` deploy and never changes. Governance could deploy a new `MaktubCore` with a different fee, but existing heartbeats on the old contract are unaffected.
- **`feeReceiver`.** Set at deploy, receive-only.
- **RecipientRegistry logic.** Immutable.
- **MKTB max supply.** Hard-capped at 100M in `MktbToken`.
- **ExecutorRewards anti-self-dealing constants.** `MIN_HEARTBEAT_AGE = 7 days`, `MIN_CHECKINS_FOR_REWARD = 1`, `maxRewardPerExecution = 10 × initial` — immutable.
- **Any individual user's heartbeat.** Governance cannot cancel, deactivate, or reroute a heartbeat owned by someone else.

## 4. Voting power

Voting power is proportional to MKTB balance at the proposal snapshot block, **provided you have delegated.** This is standard ERC-20 Votes behavior.

Delegation is required because it creates a checkpoint — a historical record of voting power at each block — which is what the Governor uses to compute votes. An undelegated balance has zero voting power.

You can delegate:

- **To yourself** if you want to vote personally
- **To another address** if you want a delegate to vote on your behalf
- **Re-delegate** at any time (no lock-up)

Delegation does not transfer tokens. Your MKTB remains in your wallet.

## 5. Delegation

To activate voting power:

```typescript
import { MaktubClient } from "@bytesbrains/maktub-sdk";

const myAddress = await signer.getAddress();
await maktub.delegateVotes(myAddress); // delegate to self
```

Or delegate to someone else:

```typescript
await maktub.delegateVotes("0xTheirAddress...");
```

Community delegates may emerge who specialize in protocol governance — professional reviewers, developers, researchers, or regional representatives. Delegating to them is a way to participate without monitoring every proposal yourself.

A delegate's voting power is computed as the sum of all MKTB delegated to them (including their own if they delegated to themselves).

## 6. Proposal lifecycle

An OpenZeppelin Governor proposal has seven distinct states.

| State | Description |
|---|---|
| Pending | Created, voting has not yet begun (voting delay) |
| Active | Voting is open |
| Defeated | Voting closed, did not pass (insufficient For votes or quorum) |
| Succeeded | Voting closed, passed. Queued-able. |
| Queued | Queued in the timelock, waiting out the delay |
| Executed | Passed timelock, executed |
| Canceled | Canceled by the proposer or governance |
| Expired | Succeeded but not queued before the timelock's grace period |

Full flow:

1. **Create.** A delegate with voting power ≥ `proposalThreshold` (100,000 MKTB) calls `propose(targets, values, calldatas, description)`. This emits a `ProposalCreated` event with a deterministic `proposalId`.
2. **Voting delay.** Configurable; default 1 day. Gives the community time to read and discuss before voting begins.
3. **Voting period.** Configurable; default 7 days. Delegates cast votes (For, Against, Abstain).
4. **Outcome.** If `For > Against` and the total `For + Abstain` meets quorum (4%), the proposal Succeeds. Otherwise it is Defeated.
5. **Queue.** Anyone can queue a Succeeded proposal. This schedules it in the timelock.
6. **Timelock delay.** Default 2 days. The queued proposal cannot be executed until the delay elapses.
7. **Execute.** After the timelock, anyone can execute the proposal. The timelock makes the on-chain calls.

See [Proposal Process](./proposals.md) for a step-by-step walkthrough including code.

## 7. The timelock

The timelock is the critical safety mechanism. Between a proposal succeeding and its effects taking effect, there is a guaranteed minimum delay during which:

- Users can observe the queued proposal
- Dissenters can raise alarm
- Exchanges can pause withdrawals if governance appears compromised
- Token holders can exit positions if they disagree with the impending change

The timelock is the only address with governance permissions on `ExecutorRewards` (holder of `GOVERNANCE_ROLE`) and the owner of the community treasury wallet. Governance proposals are executed *as* the timelock.

If governance were captured (e.g., by a whale accumulating 51% of voting power), the timelock's delay gives the community a window to respond. In an extreme case, the rest of the community can use the same window to:

- Sell MKTB (price collapse reduces the attacker's leverage)
- Fork the protocol (deploy a new MaktubCore and migrate)
- Publicly document the attack for future reference

This is a social defense, not a technical one, but it is meaningfully stronger than no-delay governance.

## 8. Participation in practice

### If you hold MKTB

- **Delegate** to yourself or a trusted delegate. Undelegated tokens have no voice.
- **Watch** the proposal forum (TBD URL) or the `ProposalCreated` event on `MktbGovernance`.
- **Read** proposals during the voting delay, before voting opens.
- **Vote** during the voting period. Abstain if you do not have an opinion — abstain counts toward quorum, so it is different from not voting at all.

### If you want to propose

- **Accumulate** or obtain delegated voting power equal to at least `proposalThreshold` (100,000 MKTB).
- **Draft** the proposal off-chain first, in the forum. Share rationale, targets, expected effects.
- **Gather feedback.** Most successful proposals go through at least one revision during pre-proposal discussion.
- **Submit** via `propose()`. Include a thorough `description` string — this is the human-readable record of the proposal.
- **Follow through.** Answer questions during the voting delay. After success, queue and ensure execution happens.

See [Proposal Process](./proposals.md) for the mechanical details.

### If you're a developer

- **Subscribe** to `ProposalCreated` and `ProposalExecuted` events on `MktbGovernance` to keep your app's user interface in sync.
- **Simulate** the state changes a proposal would produce using a fork node. This is the community's best tool against malicious proposals.
- **Publish** analysis of consequential proposals. The ecosystem depends on informed voters; good analysis is a public good.

### If you're an exchange, integrator, or institutional participant

- **Custodial voting.** If you hold MKTB for users, implement delegation so your users can vote through you. (OpenZeppelin's ERC-20 Votes extension supports this pattern.)
- **Delegate pages.** Run a public delegate page describing your voting philosophy. Users can delegate to you if they agree.
- **Timelock monitoring.** Watch the timelock queue. Pause withdrawals if a pending proposal appears to threaten user funds (there are none held by the protocol, but your own custody might be affected).

---

## Related reading

- [Proposal Process](./proposals.md)
- [Current Parameters](./parameters.md)
- [Protocol Specification](../developer/protocol-spec.md)

