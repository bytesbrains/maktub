# Executor Economics

How executors earn, what it costs to run a node, and what the math looks like at different scales of protocol usage.

This document is a model, not a promise. Actual returns depend on MKTB market value, active user count, governance parameters, and your own operational efficiency.

---

## Table of contents

1. [The reward pool](#1-the-reward-pool)
2. [Emission schedule](#2-emission-schedule)
3. [Anti-self-dealing rules](#3-anti-self-dealing-rules)
4. [Costs of running a node](#4-costs-of-running-a-node)
5. [Competition and market dynamics](#5-competition-and-market-dynamics)
6. [Modeled reward distribution at three scales](#6-modeled-reward-distribution-at-three-scales)
7. [Slashing](#7-slashing)
8. [Governance levers affecting economics](#8-governance-levers-affecting-economics)

---

## 1. The reward pool

The executor rewards pool is **35,000,000 MKTB** — 35% of the 100M total supply — allocated at the token's genesis.

The pool lives in the `ExecutorRewards` contract. When `distributeReward(executor, heartbeatId)` is called (by the protocol relay, holding `CORE_ROLE`), MKTB is transferred from the pool to the executor.

The contract caps distribution at:

- The remaining pool (cannot over-distribute beyond 35M cumulative)
- The contract's actual MKTB balance excluding staked tokens (staked tokens belong to executors, not the pool)

## 2. Emission schedule

The schedule is a 10-year halving series.

| Year | Base emission (MKTB) | Cumulative |
|---|---|---|
| 1 | 7,000,000 | 7,000,000 |
| 2 | 3,500,000 | 10,500,000 |
| 3 | 1,750,000 | 12,250,000 |
| 4 | 875,000 | 13,125,000 |
| 5 | 437,500 | 13,562,500 |
| 6 | 218,750 | 13,781,250 |
| 7 | 109,375 | 13,890,625 |
| 8 | 54,687.5 | 13,945,312.5 |
| 9 | 27,343.75 | 13,972,656.25 |
| 10 | 13,671.875 | 13,986,328 |

The halving series sums to approximately **14,000,000 MKTB over 10 years**. The remaining ~21M of the 35M pool is held as a **governance-managed reserve** — governance (via the `GOVERNANCE_ROLE` on `ExecutorRewards`) can tune `rewardPerExecution` to spend from this reserve when execution volume is higher than the base emission can cover, or to extend emissions beyond Year 10.

### Per-execution reward math

The per-execution reward is not a function of the halving year alone. It is a governance-set parameter (`rewardPerExecution`) capped at `maxRewardPerExecution = 10 × initialReward` to prevent governance drain attacks.

Intended governance policy (subject to change): set `rewardPerExecution` so that the year's expected total executions × `rewardPerExecution` ≈ the year's emission budget.

Example: in Year 1 with 7,000,000 MKTB budget:

- If expected executions = 10,000/year, `rewardPerExecution` = 700 MKTB
- If expected executions = 100,000/year, `rewardPerExecution` = 70 MKTB
- If expected executions = 1,000,000/year, `rewardPerExecution` = 7 MKTB

Executions are not evenly distributed over time. Governance is expected to tune roughly quarterly based on observed volume.

## 3. Anti-self-dealing rules

An executor that simply creates heartbeats and executes them to farm rewards would capture emissions without providing liveness value. The contract blocks this with two rules enforced in `distributeReward`:

- **`MIN_HEARTBEAT_AGE = 7 days`.** The heartbeat must have been created at least 7 days before execution.
- **`MIN_CHECKINS_FOR_REWARD = 1`.** The owner must have checked in at least once before the heartbeat expired.

An attacker trying to self-deal must therefore:

1. Create a heartbeat and check in at least once.
2. Wait at least 7 days, not checking in enough to avoid expiry.
3. Execute.

Even if the attacker is their own recipient (delivery to themselves is technically allowed), the capital cost per reward cycle is:

- The small one-time creation fee (in ETH)
- 7+ days of capital tie-up
- Stake must be active throughout

The reward for a single execution at reasonable governance parameters is meaningfully less than the compounded cost of repeating this at scale. For a dedicated attacker, it is more profitable to simply run a real executor and pick up legitimate executions.

## 4. Costs of running a node

Running the reference executor requires minimal resources.

| Component | Typical cost |
|---|---|
| VPS or home server | A low-cost VPS |
| RPC (self-hosted Base node) | No service fee (compute + ~1 TB disk) |
| RPC (paid provider) | A paid RPC provider (cost scales with tier) |
| Wallet gas for `execute` | Negligible gas per transaction |
| MKTB stake (opportunity cost) | Minimum 1,000 MKTB currently; value-dependent |
| Monitoring / alerting | Free-to-modest monitoring (Prometheus, Grafana, UptimeRobot) |

A reasonable "production starter" setup is **a modest monthly operating cost** plus the opportunity cost of the stake.

For very high volume or competitive mainnet execution, costs rise:

- Higher-tier RPC for lower latency
- Multiple RPC providers for redundancy
- A higher-cost dedicated Base node for minimum latency (compute + storage)
- Possibly MEV-aware transaction submission (Flashbots on Base via private mempools)

Latency advantage is worth real value in a first-come-first-served system. Whether it is worth the spend depends on expected reward volume.

## 5. Competition and market dynamics

Executor selection is first-come-first-served. When a heartbeat expires, any active executor can submit `execute(id)`; the first-mined wins the reward.

At small scales (1-5 executors), competition is loose — nearly every expired heartbeat gets caught. At medium scales (10-50 executors), winners are whoever has the fastest RPC and transaction submission path. At large scales (100+ executors), diminishing returns per executor; the number of executors should stabilize at the level where marginal reward ≈ marginal cost.

**The network does not need many executors to function.** Even a single honest executor is sufficient for liveness. The primary reason to want multiple executors is decentralization — no single operator should be in a position to delay or selectively omit executions.

Governance can tune `minimumStake` up or down to manage the pool of eligible executors:

- Low minimumStake → more executors, finer-grained competition
- High minimumStake → fewer executors, more capital committed per executor

Current Sepolia minimumStake (1,000 MKTB) is low. Mainnet minimumStake will likely be higher.

## 6. Modeled reward distribution at three scales

> **Note:** this section's monetary modeling was reworked to remove fiat assumptions. It now expresses rewards in MKTB only. The original fiat-denominated ROI figures have been dropped, not converted. **Flagged for human review** to confirm the qualitative framing matches intended economics.

These models assume:

- 50% of executions qualify for reward (the rest are too young or have zero check-ins)
- Governance tunes `rewardPerExecution` to fully spend the year's budget

### Year 1 scenarios

| Active users | Heartbeats executed/year | Rewardable executions | Year 1 reward budget | MKTB per executor (50 executors) |
|---|---|---|---|---|
| 10,000 | ~500 | ~250 | 7M | 140,000 MKTB |
| 100,000 | ~5,000 | ~2,500 | 7M | 140,000 MKTB |
| 1,000,000 | ~50,000 | ~25,000 | 7M | 140,000 MKTB |

**Observation:** the Year 1 total emission is fixed at 7M MKTB, independent of the user count. As long as there is *any* execution volume to absorb that emission, executors collectively earn the full 7M. What changes with scale is how many executors it takes to handle the volume — not the pool size itself.

**Per-executor reward at 50 executors** is on the order of 140,000 MKTB/year gross, before subtracting operating costs and the opportunity cost of the staked MKTB. At a low stake (1,000 MKTB) the opportunity cost is minor relative to the reward; at a very high stake (e.g., 1,000,000 MKTB) the opportunity cost of the locked capital dominates the return.

### Year 5

By Year 5, the base emission is down to 437,500 MKTB. If governance is spending from the reserve to sustain emissions:

- Base emission: 437,500 MKTB
- Reserve top-up (if governance chooses): +0 to 3M+ MKTB
- Realistic per-executor take: 1/50th of the total distributed

With no reserve top-up, Year 5 per-executor reward is roughly **1/16th** of Year 1. This is by design — early executors are expected to be richly rewarded for bootstrapping; later executors are expected to find fees and secondary economics to sustain their operations.

### Caveats

- The market value of MKTB is the dominant variable in any return calculation; the MKTB reward amounts above are fixed by the emission schedule, but what they are worth is not.
- Total executor count is set by the market. If 200 executors join and compete, per-executor take falls accordingly.
- If you run a faster, more reliable executor than the pack, your share of wins can be well above equal. Quality matters.
- Governance can change `rewardPerExecution` and `minimumStake` at any time through proposals. Watch for these.

## 7. Slashing

Governance (holding `GOVERNANCE_ROLE` on `ExecutorRewards`) can call:

```solidity
function slash(address executor, uint256 amount, string calldata reason);
```

This confiscates up to `amount` of the target executor's stake and deactivates them. Slashed tokens flow to the governance timelock.

There is no automatic on-chain slashing trigger. Slashing requires a governance proposal, which means a 7-day vote and a timelock delay — roughly 10 days total from proposal to slash. This is a deliberate design choice: slashing should be a considered community decision, not an algorithmic surprise.

Likely triggers for a slash proposal:

- Repeated self-dealing
- Coordinated denial-of-service against other executors
- Exploitation of any vulnerability discovered post-deployment

Honest operators will never be slashed.

## 8. Governance levers affecting economics

Governance can, through on-chain proposals, adjust:

| Parameter | Effect |
|---|---|
| `minimumStake` | Higher → fewer, larger executors. Lower → more, smaller. |
| `rewardPerExecution` | Higher → fewer executions needed to earn same total. Hard-capped at 10× initial. |
| Pause | Pauses reward distribution (emergency). |
| Slashing | One-off action against named executors. |

Governance **cannot** change:

- The 35M total pool
- The 10-year halving schedule (though it can top up via the reserve)
- The 7-day heartbeat-age reward eligibility rule
- The 1 check-in minimum rule
- `maxRewardPerExecution = 10 × initialReward` (immutable at deploy)

---

## Related reading

- [Running an Executor Node](./running-a-node.md)
- [Executor FAQ](./faq.md)
- [Governance Parameters](../governance/parameters.md)
- [Protocol Specification](../developer/protocol-spec.md)

