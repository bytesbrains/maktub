# contracts/ — Protocol Contracts (Solidity)

Scoped context for the Maktub protocol contracts. Read alongside the root [`../CLAUDE.md`](../CLAUDE.md). Tests live in [`../test/`](../test/CLAUDE.md); deploy scripts in [`../scripts/`](../scripts/CLAUDE.md).

## Toolchain

- Solidity **0.8.28**, Hardhat. `paths.sources = ./contracts/v3` — **Hardhat compiles only `contracts/v3/`.**
- Anything under `../legacy/` is the old v1 vault architecture (WillRegistry, WillVault, AssetManager). Kept for reference only — **must not be imported or extended.**

## Directory layout (`contracts/v3/`)

| Path | Contracts |
|---|---|
| `core/` | `MaktubCore.sol` (Beat), `MaktubFlash.sol` (Flash), `RecipientRegistry.sol`, `RecipientRegistryV2.sol`, `ExecutionRelay.sol`, `IExecutorRewards.sol` |
| `token/` | `MktbToken.sol` (ERC-20 + ERC20Votes) |
| `governance/` | `ExecutorRewards.sol`, `MktbGovernance.sol`, `IMaktubCore.sol` |
| `wallet/` | `MaktubSmartWallet.sol`, `MaktubSmartWalletFactory.sol` + interfaces |
| `mocks/` | `ReentrantCreator.sol` (test-only) |

## Architecture — Beat + Flash both live on Sepolia, mainnet Beat-first

Maktub is a **two-citizen family of fully-immutable contracts** on Base L2. **Maktub Beat** (timer-triggered, `MaktubCore.sol`) and **Maktub Flash** (instant-triggered, `MaktubFlash.sol`) are both live on Base Sepolia; both mainnet-pending. Flash was built ahead of the original "spec-only until Beat mainnet" plan — but the **mainnet** sequence is unchanged: Beat ships to mainnet first, Flash mainnet stays gated on Beat being audit-green. Both are fully immutable — no proxy, no governance, no admin, no pause, no `selfdestruct`. No other citizens at the protocol layer. Full topology: [`../docs/developer/protocol-family.md`](../docs/developer/protocol-family.md). Decision: D-021 (supersedes D-020) in the decision log (operator-local).

### Contract table

| Contract | Purpose | Status | Upgradeable? |
|---|---|---|---|
| `MaktubCore.sol` | Beat — timer-triggered CRUD, check-in, execution | Live on Base Sepolia | NO — Immutable |
| `MaktubFlash.sol` | Flash — instant-triggered delivery | Live on Base Sepolia (D-039); mainnet gated on Beat audit-green | NO — Immutable |
| `RecipientRegistry.sol` (v1) | Recipient registration, encryption pubkey storage (Beat substrate) | Live on Base Sepolia | NO — Immutable |
| `RecipientRegistryV2.sol` | Typed key slots (Flash substrate) | Live on Base Sepolia | NO — Immutable |
| `MktbToken.sol` | ERC-20 + ERC20Votes (substrate). Protocol-layer voting role: NONE. | Live | NO — Immutable |
| `ExecutorRewards.sol` | MKTB emissions to executors. **Deployed contract carries inherited admin roles (`GOVERNANCE_ROLE`, `CORE_ROLE`) + tunable params; pre-mainnet plan is to renounce those roles OR deploy a clean-room immutable V2.** Tracked internally (issue #51). | Part of deployed stack | Currently tunable; planned immutable pre-mainnet |
| Fee flow (D-024) | Every `creationFee` → 100% to hardcoded immutable Foundation address (same pattern as Beat's `feeReceiver`). MKTB value accrual = executor-stake demand (D-023). | Part of each citizen | NO — Foundation address immutable at deploy |

### Hardline architectural invariants — non-negotiable

> **Maktub Beat and Maktub Flash are fully immutable — no proxy, no governance, no admin, no pause, no `selfdestruct`. The protocol layer has zero governance over its own behavior. Bug fixes ship as new immutable deployments (V2) with opt-in user migration; old contracts run forever.**

Applies to both citizens and any future citizen. MKTB is ERC20Votes only because the interface is cheap and future apps/treasury DAOs may use it; **no function on any Maktub protocol contract reads `MktbToken.getVotes(...)`.** No governance path reaches `MaktubCore`, `MaktubFlash`, `RecipientRegistry` (any version), or `MktbToken`. No compliance hooks, KYC, identity tiering, audience features, or subscription billing at the protocol layer — apps handle all of that. Full list: [`../docs/developer/protocol-family.md`](../docs/developer/protocol-family.md) §4.

Any agent proposing a governance surface, upgrade path, admin role, or non-timer/non-send-now trigger on an existing citizen must be redirected to a new immutable deployment (bug fixes) or a new immutable citizen (new trigger semantics, gated on [`../docs/developer/protocol-family.md`](../docs/developer/protocol-family.md) §9).

### Core data structure (Beat)

```solidity
struct Heartbeat {
    address owner;
    address[] recipients;
    bytes payload;           // IPFS CID of encrypted envelope
    uint256 interval;        // seconds; minimum MIN_INTERVAL (1 hour)
    uint256 lastCheckIn;
    uint256 createdAt;
    uint256 checkInCount;
    bool executed;
    bool deactivated;
}
```

Mirror `MaktubCore.sol` exactly — if you reason about state, use the real field set (`createdAt`, `checkInCount`, and `deactivated` are easy to forget). `Heartbeat` is the struct inside Beat. It is not a citizen name — the citizen is *Maktub Beat*.

### Layer separation

- **Protocol Layer** (on-chain): citizen trigger logic (timer for Beat, send-now for Flash), recipient registry lookups, fee collection, payload-CID storage.
- **Encryption Layer** (v1, encryption-decision research is operator-local): ECIES-on-secp256k1 with hybrid symmetric envelopes. Owner encrypts per recipient using the recipient's stored public key; no external encryption network, no liveness dependency. Envelope format is versioned by an `alg` field — PRE (Threshold/TACo or Lit) remains a possible v2 swap without touching any contract.
- **Storage Layer** (IPFS/Arweave): encrypted envelope persistence, censorship-resistant, permanent. On-chain footprint is just the CID.
- **Application Layer** (React/Flutter): UX, identity mapping, account abstraction, compliance/audience/KMS/org-hierarchy logic.

### Chain: Base L2

Negligible gas, 2-second blocks, comfortably handles up to 10M users.

## Economics

- A small one-time creation fee (in ETH), free check-ins, free execution (executors earn MKTB emissions).
- 100M MKTB max supply, fair launch — 35% executor rewards, 25% treasury, 15% liquidity, 12% team (4yr vest), 10% grants, 3% launch fund.
- Canonical spec: [`../docs/developer/protocol-spec.md`](../docs/developer/protocol-spec.md).

## Commands (run from repo root)

- `npx hardhat compile` — compile v3 contracts.
- `npx hardhat test` — full unit suite (see [`../test/CLAUDE.md`](../test/CLAUDE.md)).
- `npm run gas` — `REPORT_GAS=true hardhat test`.
- `npx hardhat node` — local chain on 31337.

## Networks

Configured in `../hardhat.config.js`: `hardhat` (31337), `localhost`, `baseSepolia` (84532), `base` (8453). Env vars: `BASE_SEPOLIA_RPC_URL`, `BASE_RPC_URL`, `PRIVATE_KEY`. Canonical addresses live in [`../deployments/base-sepolia.json`](../deployments/base-sepolia.json) (source of truth, including `stale` entries).
