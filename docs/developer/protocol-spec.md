# Maktub Protocol Specification

> This is the canonical technical specification for the Maktub Protocol as shipped. It is derived from — and supersedes — the operator-local design blueprint; where the two disagree, this document reflects what was deployed.
>
> **Audience:** smart-contract developers, integrators, security auditors, researchers, and informed power users.
>
> **Scope:** the protocol layer (smart contracts), the encryption layer (in-app ECIES, with an optional Veil time-lock), the storage layer (inline on-chain / IPFS / Arweave), and the boundary between them.

---

## Table of contents

1. [Overview](#1-overview)
2. [Design principles](#2-design-principles)
3. [Layer architecture](#3-layer-architecture)
4. [Data model](#4-data-model)
5. [Contract surface](#5-contract-surface)
6. [Lifecycle of a heartbeat](#6-lifecycle-of-a-heartbeat)
7. [Encryption layer](#7-encryption-layer)
8. [Storage layer](#8-storage-layer)
9. [Fee model](#9-fee-model)
10. [Token model](#10-token-model)
11. [Executor network](#11-executor-network)
12. [Governance](#12-governance)
13. [Security model](#13-security-model)
14. [Performance and capacity](#14-performance-and-capacity)
15. [Open source and licensing](#15-open-source-and-licensing)
16. [Deferred work](#16-deferred-work)

---

## 1. Overview

Maktub Protocol is a decentralized conditional execution engine deployed on Base L2. It implements a single primitive:

> **If the owner does not check in within a specified interval, an encrypted payload becomes decryptable by designated recipients.**

The primitive is realized as a struct called a `Heartbeat`:

```
Heartbeat = {
    owner: address,
    recipients: address[],
    payload: bytes,           // inline encrypted envelope (≤4096B), or a CID for oversize media
    interval: uint256,        // seconds; minimum 1 hour, maximum 365 days
    lastCheckIn: uint256,     // block.timestamp of last check-in
    createdAt: uint256,       // block.timestamp at creation
    checkInCount: uint256,    // number of owner check-ins
    executed: bool,           // one-shot flag
    deactivated: bool         // owner-only emergency stop
}
```

The protocol does not custody, transfer, or manage any ERC-20, ERC-721, ERC-1155, or native tokens on behalf of users. It transfers *information*. Crypto transfer is achieved by encoding wallet credentials in the payload; the recipient reconstructs wallet control on their own device.

## 2. Design principles

Four principles constrained every design decision.

1. **Minimal primitive.** The protocol layer encodes exactly one mechanism (recipients + payload + timer). Everything else — identity, account abstraction, onboarding, UX — is pushed to the application layer.

2. **Immutable core.** The contracts that enforce the primitive (`MaktubCore`, `RecipientRegistry`, `MktbToken`) have no admin, no pause, no upgrade path. Users trust math, not governance. Only the peripheral contracts (`ExecutorRewards`, `MktbGovernance`) are upgradeable through on-chain governance.

3. **Purpose over profit.** The creation fee is a small one-time fee in wei (ETH), deliberately set low so that protecting your family is globally affordable. Check-ins are free. Execution is free for users; executors are compensated in MKTB emissions rather than user fees.

4. **Permanence on execution.** Once a heartbeat is executed, the delivery is irrevocable. No recall, no tamper, no modification. This matches the semantics of a dropped letter.

## 3. Layer architecture

Four distinct layers, each independently replaceable.

| Layer | Role | Implementation |
|---|---|---|
| Application | UX, identity, onboarding, account abstraction | React web app, Flutter mobile app, third-party integrations |
| Encryption | Per-recipient key wrapping, content encryption | In-app ECIES on secp256k1 (always on); optional Veil time-lock via the in-house Warden federation (preview) |
| Protocol | Heartbeat CRUD, timers, execution triggers, fee collection, executor stake, governance | Five Solidity contracts on Base L2 |
| Storage | Encrypted payload persistence | Inline on-chain (normal letters, ≤4096B); IPFS (content-addressed) + Arweave (paid permanence) for oversize media |

Separation of concerns is a critical property. A protocol-layer bug cannot reveal plaintext (the protocol never sees it). An application-layer bug cannot drain user funds (the protocol never holds them). A storage-layer compromise does not break confidentiality (the stored bytes are ciphertext only a named recipient's private key can open). Encryption happens in the app/SDK, on the sender's device, before anything leaves it — the base case depends on no external network at all.

## 4. Data model

### 4.1 Heartbeat struct

Defined in `MaktubCore.sol`:

```solidity
struct Heartbeat {
    address owner;
    address[] recipients;
    bytes payload;
    uint256 interval;
    uint256 lastCheckIn;
    uint256 createdAt;
    uint256 checkInCount;
    bool executed;
    bool deactivated;
}
```

- `payload` is the inline encrypted envelope (≤ `MAX_PAYLOAD_BYTES` = 4096) for a normal letter; oversize media uses an IPFS CID serialized as raw bytes instead. The contract treats it as opaque bytes either way — it does not parse it; any bytes within the cap are valid as long as the application layer agrees on the encoding.
- `lastCheckIn` is set to `block.timestamp` at creation and reset on each check-in.
- `createdAt` is never modified after creation; used by `ExecutorRewards` to gate reward eligibility (heartbeat must be ≥ 7 days old to qualify).
- `checkInCount` excludes creation; a heartbeat with zero check-ins has `checkInCount == 0`.
- `executed` and `deactivated` are terminal, one-shot state flags. Once either is true, no further check-in, update, execute, or deactivate operations succeed.

### 4.2 Heartbeat identity

Heartbeats are indexed by a monotonically increasing `uint256 id`, starting at 0. `heartbeatCount` is the next unused id. A heartbeat is uniquely identified by its id; there are no natural keys (no `(owner, nonce)` tuple).

Recipient addresses are verified against the Recipient Registry at creation time and on recipient updates. A recipient cannot be named on a heartbeat unless they have previously registered.

### 4.3 Constants (immutable)

| Constant | Value | Source |
|---|---|---|
| `MIN_INTERVAL` | 1 hour | `MaktubCore.MIN_INTERVAL` |
| `MAX_INTERVAL` | 365 days | `MaktubCore.MAX_INTERVAL` |
| `MAX_RECIPIENTS` | 50 | `MaktubCore.MAX_RECIPIENTS` |
| `creationFee` | fixed in wei at deploy (small one-time fee, in ETH) | `MaktubCore.creationFee` |

## 5. Contract surface

The deployed protocol consists of five contracts.

| Contract | Purpose | Upgradeable? | Admin? |
|---|---|---|---|
| `MaktubCore` | Heartbeat CRUD, timer, execution | No | No |
| `RecipientRegistry` | Recipient + ECIES public key registry (the on-chain field is named `prePublicKey` for historical reasons) | No | No |
| `MktbToken` | ERC-20 + ERC-20 Votes governance token, capped at 100M | No (admin can renounce) | Yes, for minting up to cap |
| `ExecutorRewards` | Executor staking, reward emissions, slashing | Yes (governance) | Governance timelock |
| `MktbGovernance` | OpenZeppelin Governor for parameter governance | Yes (governance) | Timelock-controlled |

Full function-by-function reference is in [Contract Reference](./contracts.md).

## 6. Lifecycle of a heartbeat

### 6.1 Creation

1. Application encrypts the payload client-side: it builds one hybrid envelope (an AEAD content key encrypts the body) and wraps that content key once per recipient using each recipient's registered ECIES secp256k1 public key. For a Veil (time-locked) heartbeat, the app additionally wraps the envelope in a Veil gate (preview; see §7).
2. The ciphertext rides inline inside the create transaction when it fits the on-chain size cap; only oversize media is uploaded to IPFS and referenced by CID.
3. Application calls `MaktubCore.createHeartbeat(recipients, payload, interval)` with `msg.value >= creationFee`, where `payload` is the inline ciphertext (or the CID bytes for oversize media).
4. The contract validates:
    - `msg.value >= creationFee`
    - `MIN_INTERVAL <= interval <= MAX_INTERVAL`
    - `0 < recipients.length <= MAX_RECIPIENTS`
    - `payload.length > 0`
    - every recipient address is registered in `RecipientRegistry`
5. The contract assigns `id = heartbeatCount`, increments the counter, stores the heartbeat with `lastCheckIn = createdAt = block.timestamp`, transfers the fee to `feeReceiver`, refunds any excess to `msg.sender`, and emits `HeartbeatCreated(id, owner, recipients, interval)`.

### 6.2 Check-in

1. Owner calls `MaktubCore.checkIn(id)` from the owner's wallet.
2. The contract verifies the caller is the owner, the heartbeat exists, and is active (not executed, not deactivated).
3. The contract sets `lastCheckIn = block.timestamp`, increments `checkInCount`, and emits `HeartbeatCheckedIn(id, block.timestamp)`.

Check-in carries no protocol fee. Network gas is approximately 45,000 units — negligible network gas on Base.

### 6.3 Update recipients

Allowed only while active. Resets `lastCheckIn` to `block.timestamp` (safety-margin reset). All new recipients must be registered. Emits `RecipientsUpdated(id, newRecipients)`.

### 6.4 Update interval

Allowed only while active. Does **not** reset `lastCheckIn` — the new interval takes effect against the existing last check-in. This is a deliberate choice: shortening the interval could push the heartbeat into an already-expired state; lengthening it extends the current countdown without requiring the owner to re-check-in. Emits `IntervalUpdated(id, newInterval)`.

### 6.5 Execution

1. Anyone who is an active staked executor calls `MaktubCore.execute(id)`.
2. The contract verifies:
    - Heartbeat exists, is active (not executed, not deactivated)
    - `executorRewards.isActiveExecutor(msg.sender)` is true
    - `block.timestamp > lastCheckIn + interval` (timer has expired)
3. The contract sets `executed = true` and emits `HeartbeatExecuted(id, executor, block.timestamp)`.

Execution is a one-shot, irreversible state transition. Subsequent attempts revert with `AlreadyExecuted`.

### 6.6 Reward distribution

A separate contract (`ExecutorRewards`) handles reward emissions. Typically called by a protocol-maintained relay with `CORE_ROLE` after observing a `HeartbeatExecuted` event. The relay calls `ExecutorRewards.distributeReward(executor, heartbeatId)`, which:

1. Verifies the executor is active, contract is not paused, MaktubCore is set.
2. Fetches the heartbeat via `IMaktubCore.getHeartbeat(heartbeatId)` and confirms:
    - `executed == true`
    - `block.timestamp - createdAt >= MIN_HEARTBEAT_AGE` (7 days)
    - `checkInCount >= MIN_CHECKINS_FOR_REWARD` (1)
3. Computes the current reward amount (governance-tuned, bounded by `maxRewardPerExecution = 10 × initialReward`).
4. Caps by remaining pool budget and actual contract MKTB balance.
5. Transfers MKTB to the executor and emits `RewardDistributed(executor, amount)`.

Heartbeats younger than 7 days, or with zero check-ins, execute normally but earn no reward. This prevents self-dealing (creating a heartbeat purely to farm rewards).

### 6.7 Deactivation

Owner calls `MaktubCore.deactivate(id)`. Sets `deactivated = true`, permanent and irreversible. Emits `HeartbeatDeactivated(id)`.

### 6.8 Recipient claim

Off-chain and on-device. After execution:

1. Each recipient's app reads the heartbeat's `payload` — the inline ciphertext, or fetches it from IPFS by the CID stored there for oversize media.
2. The recipient locates the key-wrap addressed to them inside the hybrid envelope and unwraps the content key with their own ECIES private key, which never leaves their device. They then decrypt the body locally. For a normal (non-Veil) letter this works the moment the app reads the payload.
3. For a **Veil (time-locked)** letter, the recipient additionally needs the Veil gate, which the Warden federation only releases once it observes the on-chain delivery condition (`HeartbeatExecuted`) — so until execution even the recipient cannot read it. On the current testnet the federation is operator-run, so this timing is a **preview**, not yet a guarantee (see §7).

This flow does not touch the protocol layer. Claiming is free (no on-chain transaction required, though recipients may pay gas if the application implements an on-chain claim acknowledgment).

## 7. Encryption layer

Maktub v1 encrypts **in the app/SDK, on the sender's device, before anything leaves it.** The protocol stores only opaque ciphertext. There are two layers: a base confidentiality layer that is always on, and an optional Veil time-lock that is a preview.

### 7.1 Base confidentiality — in-app ECIES on secp256k1 (always on)

The base case is **hybrid, per-recipient ECIES on the secp256k1 curve, performed entirely client-side.** There is no external re-encryption network, no threshold service, nothing to subpoena, pay, or shut down. When a heartbeat is created:

1. The sender's device generates a fresh symmetric content key and uses it with an AEAD cipher (AES-256-GCM) to encrypt the payload **once** into a compact hybrid envelope.
2. The content key is then **wrapped once per recipient** using each recipient's registered ECIES secp256k1 public key (via ECIES, with HKDF-SHA-256 for key derivation). Adding a recipient costs one more key-wrap — that is the per-recipient work the safety limit and per-recipient fee account for.
3. Only the matching ECIES **private key** — which never leaves a recipient's device — can unwrap that recipient's copy of the content key and decrypt the envelope.

This gives **confidentiality**: only a named recipient can read the payload. It is shipped and real. The team that built the protocol, the executors, and anyone reading the chain see only ciphertext.

> **Why not Proxy Re-Encryption?** An earlier design imagined delivery via a Proxy-Re-Encryption / threshold network. For v1 the protocol deliberately uses in-app ECIES instead: it adds no runtime dependency on a third-party network's liveness, pricing, or geography, and there is nothing for an adversary to censor. Conditional-decryption is provided instead by the optional in-house Veil layer (§7.3), as a preview — not by any external PRE provider.

### 7.2 Recipient keys and `RecipientRegistry`

Recipients register an **ECIES secp256k1 public key** on-chain via `RecipientRegistry` before they can be named on a heartbeat. The on-chain functions are `registerRecipient(prePublicKey)`, `getPrePublicKey(address)`, and `updatePrePublicKey(newKey)`. These identifiers are named `prePublicKey` for **historical reasons** — the original design considered Proxy Re-Encryption — and are **immutable on-chain**, so they are kept exactly as deployed. The value the field stores is an ECIES secp256k1 public key (33 bytes compressed or 65 uncompressed), not a PRE key.

Key lifecycle:

- **Owner keypair.** An ECIES secp256k1 keypair generated client-side at first use of the app. The private key is stored in the app's secure storage (secure enclave on mobile, IndexedDB behind passkey on web) and never leaves the device. (Reading-key recovery is a separate app-layer concern.)
- **Recipient keypair.** An ECIES secp256k1 keypair generated client-side at registration. The private key stays on the recipient's device; the public key is submitted to `RecipientRegistry` via `registerRecipient(prePublicKey)`.
- **No re-encryption keys.** Because the base layer does per-recipient wrapping at creation time, there are no proxy re-encryption keys to generate, fragment, or distribute. Changing the recipient set means sealing a new heartbeat — re-pointing the recipient list cannot re-encrypt an already-sealed payload.

### 7.3 Veil time-lock (optional, PREVIEW)

For a *time-locked* letter, the app additionally wraps the hybrid envelope in a **Veil** gate. The in-house **Warden** federation — a threshold-IBE network — withholds the decryption gate until the on-chain delivery condition (the heartbeat's execution, signalled by `HeartbeatExecuted`) is met. Until execution, **even the recipient cannot read the letter.** This is the time-confidentiality property.

On the current testnet the Warden federation is **operator-run**, so Veil is a **preview, not yet a guarantee**: a determined recipient could in principle read a plain (non-Veil) on-chain ciphertext before the trigger fires, and the operator-run federation is not yet an adversarial-strength timing guarantee. Recipient confidentiality (§7.1) holds with or without Veil; only the *timing* property is preview. Warden ships as `warden_ffi` (pub.dev) plus the `bytesbrains/warden` node image (Docker Hub).

### 7.4 Cost of encryption operations

Encryption is local and imposes no per-recipient network fee:

- Envelope encryption and per-recipient key-wrapping (client-side): free, milliseconds of CPU. Cost scales with recipient count only as on-device CPU and as the protocol's per-recipient creation fee.
- Veil gating (client-side wrap): free; the Warden federation's operating cost is borne by the federation, not charged per use during the preview.

## 8. Storage layer

### 8.1 Inline-default, off-chain for oversize media

Under the **inline-payload model** (#139), a normal letter's encrypted envelope rides **inline** in the on-chain `payload` field (≤ `MAX_PAYLOAD_BYTES = 4096`) — the body lives in contract state and needs no off-chain storage at all. Only **oversize media** that exceeds the inline cap is stored off-chain and referenced by a CID in the same `payload` field.

For that oversize-media path, the ciphertext is pinned to two independent systems:

- **IPFS** — content-addressed peer-to-peer network. Fast retrieval, no per-byte cost. Maktub operates a pinning service with reputable third-party pinning (Filebase, Pinata) as fallbacks.
- **Arweave** — blockchain-based permanent storage. Paid at upload time (a small per-MB cost), expected to persist 200+ years.

The same CID is uploaded to both. If one network has availability issues, the other serves.

### 8.2 On-chain persistence

For a normal letter the inline ciphertext (≤ 4096 bytes) is stored directly on-chain. For oversize media only the CID (as `bytes`, typically ~34 bytes) is stored on-chain. In the inline case the payload dominates per-heartbeat storage cost; in the CID case storage cost is dominated by the other fields (owner, recipients array, timestamps).

### 8.3 Payload size

**`MAX_PAYLOAD_BYTES = 4096` (inline-payload model, #139 — supersedes D-030's CID-only 256).** Both contracts in this repository enforce this bound on both citizens (`MaktubCore.createHeartbeat`, `MaktubFlash.flash`): a payload over 4096 bytes reverts with `PayloadTooLarge`. The cap is a gas / storage / executor-processing safety bound, not a rule forcing content off-chain — a normal encrypted envelope fits inline within it, and only media that exceeds it falls back to an off-chain CID. See [protocol-family.md](protocol-family.md) §4 invariant 6.

> **Currently deployed Beat.** The live Beat predates the `MAX_PAYLOAD_BYTES` constant and imposes **no** Solidity-level maximum payload length (the `bytes` type has no inherent cap, though gas cost rises with length); it stays that way forever (immutable). It already carries inline ciphertext today. The 4096-byte bound lands on the next deployment. This is the same deployed-vs-next-deployment split this spec records for `MAX_RECIPIENTS` (§4.3 documents the deployed `50`; the committed value for redeployments is `100`).

## 9. Fee model

### 9.1 Fee schedule

| Action | Protocol fee | Gas (Base) |
|---|---|---|
| `createHeartbeat` | `creationFee` (wei, in ETH) | negligible network gas |
| `checkIn` | 0 | negligible network gas |
| `execute` | 0 | negligible network gas |
| `updateRecipients` | 0 | negligible network gas |
| `updateInterval` | 0 | negligible network gas |
| `deactivate` | 0 | negligible network gas |
| Recipient registration | 0 | negligible network gas |
| Recipient claim (off-chain) | 0 | 0 |

### 9.2 Fee sink

Fees flow to the `feeReceiver` address, set at deployment and not modifiable. This address is a multisig controlled by the community treasury, not the team. `feeReceiver` can only receive ETH; it has no other permissions over any contract.

### 9.3 Price oracle considerations

The `creationFee` is denominated in wei, fixed at deploy time. As the market price of ETH fluctuates, the fiat-equivalent value of the fee drifts; the wei amount itself never changes. Governance can deploy a new `MaktubCore` with a revised fee if the drift becomes significant, but existing heartbeats are unaffected.

A future upgrade to peg the fee to a price oracle has been explored and deferred. See [Deferred work](#16-deferred-work).

## 10. Token model

### 10.1 MKTB specification

- Name: Maktub
- Symbol: MKTB
- Decimals: 18
- Max supply: 100,000,000 MKTB (hard cap enforced in `MktbToken.mint`)
- Standard: ERC-20, ERC-20 Burnable, ERC-20 Permit, ERC-20 Votes
- Chain: Base L2

### 10.2 Allocation

| Allocation | % | Amount (MKTB) | Vesting |
|---|---|---|---|
| Executor rewards | 35% | 35,000,000 | 10-year emission, halving schedule |
| Community treasury | 25% | 25,000,000 | Governance-controlled |
| Liquidity | 15% | 15,000,000 | Locked on launch |
| Team | 12% | 12,000,000 | 4-year linear vest, 1-year cliff |
| Ecosystem grants | 10% | 10,000,000 | Governance-controlled |
| Launch fund | 3% | 3,000,000 | Available at launch |

### 10.3 Minting

`MktbToken.mint(to, amount)` is callable only by the owner (initially a multisig or governance timelock) and reverts if it would exceed `MAX_SUPPLY`. The owner can `renounceOwnership()` to permanently disable minting.

### 10.4 Utility

- Executor staking (required)
- Governance voting (via ERC-20 Votes delegation)
- Optional fee payment in MKTB (future; not enabled at launch)

## 11. Executor network

### 11.1 Economic model

Executors stake MKTB to participate. When they submit `execute(id)`, they earn MKTB from the 35M executor rewards pool.

- Emission base: Year 1 ≈ 7M MKTB, halved each subsequent year. The halving series sums to ≈ 14M over 10 years. The remaining ≈ 21M of the 35M pool is a governance-managed reserve that extends emissions beyond the base curve as execution volume grows.
- Per-execution reward: governance-tunable, capped at 10× the initial reward to prevent governance drain attacks.
- Minimum stake: governance-tunable (initially 1,000 MKTB on Sepolia).

### 11.2 Selection mechanism

First-come-first-served. Any active executor can submit `execute(id)`; the first successful transaction wins. No priority mechanism, no auction, no assignment. Competition keeps latency low.

### 11.3 Anti-self-dealing

An executor could otherwise create a heartbeat, wait the minimum interval, and execute it themselves to farm rewards. This is neutralized by two guardrails in `ExecutorRewards.distributeReward`:

- Heartbeat must be at least `MIN_HEARTBEAT_AGE = 7 days` old.
- Heartbeat must have `checkInCount >= MIN_CHECKINS_FOR_REWARD = 1`.

Executions of heartbeats that fail these checks still succeed (the payload still delivers) but pay no reward.

### 11.4 Slashing

Governance (via the timelock) can call `slash(executor, amount, reason)` to confiscate a portion of an executor's stake. Intended for demonstrated misbehavior — e.g., front-running legitimate executions for illegitimate reasons. Slashed tokens flow to governance. There is no automatic on-chain slashing condition.

## 12. Governance

### 12.1 Scope

Governance controls the **peripheral** contracts and their parameters:

- `ExecutorRewards` minimum stake, reward per execution, pause state, and slashing
- `MktbGovernance` voting parameters (delay, period, threshold)
- Community treasury spending (via governance proposals targeting the treasury wallet)
- Ecosystem grants
- Deployment of new peripheral modules

Governance **cannot** change:

- `MaktubCore` logic, constants, or fee
- `RecipientRegistry` logic
- `MktbToken` supply cap
- Any existing heartbeat (cannot deactivate, modify, or re-route)

### 12.2 Voting parameters

Default values at deploy (modifiable by governance):

| Parameter | Value |
|---|---|
| Voting delay | 1 day (43,200 blocks on Base L2 at ~2s/block) |
| Voting period | 7 days (302,400 blocks on Base L2 at ~2s/block) |
| Proposal threshold | 100,000 MKTB |
| Quorum | 4% of total supply |
| Timelock delay | 2 days (default; parameterized at deploy) |

### 12.3 Process

Standard OpenZeppelin `Governor` with `GovernorTimelockControl`. Proposals:

1. **Create.** A holder with ≥ proposal threshold delegates voting power to an address and submits a proposal (targets, values, calldatas, description).
2. **Delay.** Voting cannot start until the voting delay has elapsed (gives holders time to review).
3. **Vote.** For/Against/Abstain. Simple majority with quorum requirement.
4. **Queue.** If successful, the proposal is queued in the timelock.
5. **Execute.** After the timelock delay, anyone can trigger execution.

See [Proposal Process](../governance/proposals.md) for a step-by-step walkthrough.

## 13. Security model

### 13.1 Threat inventory

| Threat | Mitigation |
|---|---|
| Spam heartbeat creation | the wei-denominated creation fee makes spam uneconomical |
| Timer manipulation | `block.timestamp`-based, with `MIN_INTERVAL = 1 hour` to absorb drift |
| Executor collusion | First-come-first-served; any executor can trigger; no benefit to collusion |
| Payload interception | Per-recipient ECIES envelope; ciphertext is useless without a named recipient's private key |
| Owner key compromise | Owner can update recipients or deactivate the heartbeat |
| Recipient key compromise | Owner can remove compromised recipient from the list |
| Protocol rug pull | Core contracts immutable; no admin, no pause, no upgrade |
| Executor Sybil attack | MKTB staking requirement; governance can raise minimum |
| Governance capture | 4% quorum, 7-day voting period, 2-day timelock, immutable core limits damage |
| Chain reorg | Base L2 finalizes to L1; reorgs vanishingly rare after finality |
| Self-dealing by executors | 7-day heartbeat age + 1 check-in minimum for reward eligibility |
| Front-running of `execute` | Acceptable: whoever wins the race is still a valid executor |

### 13.2 What cannot be attacked at the protocol layer

- Core contract logic (immutable bytecode)
- Encrypted payloads (mathematically opaque without the intended recipient's ECIES private key)
- Permanent storage (content-addressed, multiple networks, no single-node dependency)
- Timer correctness (deterministic `block.timestamp` comparison)

### 13.3 Known residual risks

- **Veil federation liveness (preview only).** The base ECIES layer has no external dependency — a recipient can decrypt as soon as they read the payload. Only the optional Veil time-lock depends on the Warden federation: if it were to degrade, release of a Veil gate (and thus a time-locked recipient's read) would be delayed until recovery. On-chain execution and base-case decryption are unaffected. Veil is a preview on the current testnet, not yet a timing guarantee.
- **Base sequencer.** Base is a single-sequencer rollup at time of deployment. Prolonged sequencer downtime delays transactions; L1 fallback exists but is slower and costlier.
- **Block timestamp drift.** Miners can manipulate `block.timestamp` within a small window (~15 seconds). Irrelevant at a 1-hour minimum interval.
- **Owner key loss.** By design: protocol cannot recover lost keys.

## 14. Performance and capacity

### 14.1 Throughput

Based on the Base L2 theoretical capacity of ~1,069 tx/sec:

| Active users | Tx/hour (check-ins) | % Base capacity |
|---|---|---|
| 1,000 | 19 | 0.002% |
| 10,000 | 194 | 0.018% |
| 100,000 | 1,940 | 0.18% |
| 1,000,000 | 19,400 | 1.84% |
| 10,000,000 | 194,000 | 18.15% |
| 100,000,000 | 1,940,000 | 180% (over capacity) |

The protocol scales comfortably up to ~10M active users on Base alone. Beyond that, L3 or app-chain scaling is required. See [Deferred work](#16-deferred-work).

### 14.2 Execution latency

Typical delay from timer expiry to `HeartbeatExecuted`:

| Condition | Delay |
|---|---|
| Normal operation | 2-10 seconds |
| Network congestion | 5-30 seconds |
| Heavy congestion | 30 seconds - 5 minutes |
| Sequencer downtime | Minutes to hours |

For context: the protocol is NOT a real-time emergency system. Use local emergency services for life-threatening emergencies.

## 15. Open source and licensing

| Component | License |
|---|---|
| Protocol contracts (`contracts/v3/`) | MIT |
| SDK — `@bytesbrains/maktub-sdk` | MIT |
| Executor node | MIT |
| Reference web app (separate repo) | BSL 1.1, converts to MIT two years after deployment |
| Reference mobile app (separate repo) | BSL 1.1, converts to MIT two years after deployment |
| Documentation | CC BY 4.0 |

The MIT protocol layer permits forks, third-party frontends, integrations, and derivative works from day one. The BSL reference applications protect the initial team's engineering investment without foreclosing future openness.

## 16. Deferred work

Items explored in design but not included at launch. Each is a future governance proposal or protocol evolution.

- **Fee peg to a price oracle.** Would keep the fee's real-world value stable against ETH volatility. Requires oracle dependency which is against the immutability-of-core principle. Workaround: governance can deploy a new MaktubCore with an updated fee and migrate the frontend over time.
- **Multisig-controlled heartbeats.** Heartbeats where check-in requires m-of-n signatures. Achievable today via a smart-contract wallet (e.g., Safe) owning the heartbeat. No protocol change needed.
- **Conditional executors beyond time.** E.g., oracle-triggered heartbeats. Considered out of scope — the "silence" primitive is deliberately simple and adding branches would turn Maktub into a general-purpose conditional execution platform.
- **Native cross-chain delivery.** Currently Base only. Cross-chain would require bridging primitives that impose trust assumptions we have deliberately avoided. Application-layer alternative: multiple Maktub deployments on different chains with a common recipient registry synchronization.
- **Recipient acknowledgment.** A way for recipients to publicly acknowledge receipt. Out of scope — some recipients (e.g., journalism custodians) explicitly do not want to acknowledge. Applications can implement this as a client-side convention.
- **L3 scaling.** Triggered by growth past ~10M active users. Design is pre-drafted in the blueprint; deployment is a governance decision, not an immediate priority.
- **Soft-deletion / expiry of payloads.** Deliberately not supported. Once delivered, permanent — per design principles.

---

## Related reading

- [Contract Reference](./contracts.md)
- [SDK Reference](./sdk.md)
- [Integration Guide](./integration.md)
- [Deploying Your Own App](./deploying-own-app.md)
- [Code Examples](./examples.md)
- [Governance Parameters](../governance/parameters.md)
- [Executor Economics](../executor/economics.md)

