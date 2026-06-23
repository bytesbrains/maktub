# Current Parameters

A live reference to every tunable parameter in the Maktub Protocol. Values in this document reflect deployed state; for any discrepancy, on-chain state is authoritative.

To read any value live, use the `@bytesbrains/maktub-sdk` or read the contract directly on Basescan.

---

## Table of contents

1. [Deployed addresses](#1-deployed-addresses)
2. [MaktubCore (immutable)](#2-maktubcore-immutable)
3. [RecipientRegistry (immutable)](#3-recipientregistry-immutable)
4. [MktbToken](#4-mktbtoken)
5. [ExecutorRewards (governable)](#5-executorrewards-governable)
6. [MktbGovernance (governable)](#6-mktbgovernance-governable)
7. [TimelockController](#7-timelockcontroller)
8. [Token allocation](#8-token-allocation)

---

## 1. Deployed addresses

### Base Sepolia (testnet)

| Contract | Address |
|---|---|
| MaktubCore | `0x46f491eD5A82dA53Eb077aE35C4C5ed328864331` |
| RecipientRegistry | `0xfF66eEbFCf0C27f682B84500731752AaCAc7BBc9` |
| MktbToken | `0x068d9176514C868d8fB43CE84A775b63cf223C5D` |
| ExecutorRewards | `0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba` |
| MktbGovernance | *Pending redeploy with corrected Base L2 block counts; previous deploy `0xc60EAF688ADf6Cf9b0512De5d06f7341F1993Ddc` is **stale** — do not use* |
| TimelockController | `0x268602317bF433A88a2cB93e06E458DC4fFC46b9` |
| Fee receiver | *Published at deploy* |

### Base Mainnet

Pending audit completion and mainnet deployment.

---

## 2. MaktubCore (immutable)

None of these values can be changed after deployment.

| Parameter | Value | Notes |
|---|---|---|
| `MIN_INTERVAL` | 1 hour (3,600 seconds) | Protocol-enforced minimum check-in interval |
| `MAX_INTERVAL` | 365 days (31,536,000 seconds) | Protocol-enforced maximum |
| `MAX_RECIPIENTS` | 50 | Maximum recipients per heartbeat |
| `creationFee` | Small one-time fee, fixed in wei at deploy | Immutable; read via `creationFee()` |
| `feeReceiver` | Set at deploy | Receive-only; no control over contract |
| `recipientRegistry` | Set at deploy | Address of linked RecipientRegistry |
| `executorRewards` | Set at deploy | Address of linked ExecutorRewards |

Changing any of these requires deploying a new `MaktubCore`. Existing heartbeats would remain on the old contract, unaffected.

---

## 3. RecipientRegistry (immutable)

No configurable parameters. Functions `register`, `updatePrePublicKey`, `isRegistered`, `getPrePublicKey` operate on the same logic forever.

---

## 4. MktbToken

| Parameter | Value | Governance? |
|---|---|---|
| `MAX_SUPPLY` | 100,000,000 MKTB (100M × 10^18) | Immutable |
| `name` | "Maktub" | Immutable |
| `symbol` | "MKTB" | Immutable |
| `decimals` | 18 | Immutable |
| Owner (minter) | Set at deploy; renounceable | Can only be transferred or renounced by the current owner |

Once `renounceOwnership()` is called, no further minting is possible. The current plan is to renounce after the initial distributions are complete.

---

## 5. ExecutorRewards (governable)

### Immutable at this contract

| Parameter | Value |
|---|---|
| `TOTAL_REWARD_POOL` | 35,000,000 MKTB (35M × 10^18) |
| `HALVING_PERIOD` | 365.25 days |
| `TOTAL_PERIODS` | 10 |
| `YEAR_ONE_EMISSION` | 7,000,000 MKTB |
| `MIN_HEARTBEAT_AGE` | 7 days |
| `MIN_CHECKINS_FOR_REWARD` | 1 |
| `maxRewardPerExecution` | 10 × initial `rewardPerExecution` (drain-attack cap) |
| `mktbToken` | The MKTB address |
| `emissionStart` | Deploy timestamp |

### Governable (via `GOVERNANCE_ROLE`)

| Parameter | Current (Sepolia) | Who can change |
|---|---|---|
| `minimumStake` | 1,000 MKTB (10^3 × 10^18) | Timelock after governance vote |
| `rewardPerExecution` | TBD | Timelock after governance vote |
| `paused` | `false` | Timelock after governance vote |

### Roles

| Role | Holder |
|---|---|
| `DEFAULT_ADMIN_ROLE` | Deployer at first, **renounced** after initial role setup |
| `GOVERNANCE_ROLE` | `TimelockController` |
| `CORE_ROLE` | `MaktubCore` (or a designated reward relay) |

---

## 6. MktbGovernance (governable)

### Default values at deploy (updatable by governance)

Calibrated for Base L2 (~2-second blocks):

| Parameter | Default | Wall-clock | Meaning |
|---|---|---|---|
| `votingDelay` | 43,200 blocks | ~24 hours | Time between proposal creation and voting start |
| `votingPeriod` | 302,400 blocks | ~7 days | Duration of voting |
| `proposalThreshold` | 100,000 MKTB (10^5 × 10^18) | — | Minimum voting power to create a proposal |
| `quorumNumerator` | 4 | — | 4% of total MKTB supply must participate (For + Abstain) |

**Block time note:** These block counts are calibrated for Base L2 (~2s). On chains with different block times (e.g., Ethereum mainnet at ~12s), the constructor arguments must be recomputed before deploy, or governance must update them post-deploy.

**Historical:** An earlier Base Sepolia deployment used 7,200 / 50,400 (Ethereum-mainnet-calibrated) values, which produced wall-clock durations 1/6 of intended. That deployment is stale; the first-proposal playbook (operator-local) documents the procedure to follow if a future redeploy ever ships with the wrong values again.

Deployed values will be kept up-to-date here as governance evolves them.

---

## 7. TimelockController

| Parameter | Default | Notes |
|---|---|---|
| `minDelay` | 2 days | Minimum delay from queue to executable |
| `PROPOSER_ROLE` | `MktbGovernance` | Who can queue proposals |
| `EXECUTOR_ROLE` | `address(0)` (open) | Anyone can execute after delay |
| `CANCELLER_ROLE` | `MktbGovernance` | Who can cancel queued proposals |
| Admin | `MktbGovernance` (or renounced) | Who can reconfigure roles |

The timelock is the address that holds `GOVERNANCE_ROLE` on `ExecutorRewards` and (indirectly) controls the treasury.

---

## 8. Token allocation

| Allocation | % | Amount (MKTB) | Vesting / Custody |
|---|---|---|---|
| Executor rewards | 35 | 35,000,000 | 10-year emission via `ExecutorRewards` |
| Community treasury | 25 | 25,000,000 | Governance-controlled wallet |
| Liquidity | 15 | 15,000,000 | Locked on launch in DEX liquidity pools |
| Team | 12 | 12,000,000 | 4-year linear vest, 1-year cliff, via standard vesting contract |
| Ecosystem grants | 10 | 10,000,000 | Governance-controlled grant pool |
| Launch fund | 3 | 3,000,000 | Initial development + audits |

**Total: 100%** = 100,000,000 MKTB.

The hard cap is enforced in `MktbToken.mint` and cannot be exceeded.

---

## How to read these live

Via the SDK:

```typescript
import { MaktubClient } from "@bytesbrains/maktub-sdk";

const fee = await maktub.creationFee();
const minStake = (await maktub.getEmissionInfo()).minimumStake;
const remaining = (await maktub.getEmissionInfo()).remainingPool;
const totalSupply = (await maktub.getTokenInfo()).totalSupply;
```

Via Basescan: load the contract address and use the "Read Contract" tab. No wallet required for view functions.

---

## Related reading

- [Governance Overview](./overview.md)
- [Proposal Process](./proposals.md)
- [Protocol Specification](../developer/protocol-spec.md)
- [Executor Economics](../executor/economics.md)

