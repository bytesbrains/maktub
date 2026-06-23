# Maktub Protocol

> **It is written. And only for whom it is written.**

Maktub is a decentralized **conditional execution** protocol on Base L2. One primitive:

```
Recipients + Payload + Timer = Heartbeat
```

If the owner stops checking in within their chosen interval, an encrypted payload is delivered to the recipients they designated — **inevitably** (no recall, no admin, no one can stop it) and **only to those recipients** (end-to-end encrypted, content-confidential).

The protocol **custodies no cryptocurrency or tokens**. It transfers *encrypted information* — seed phrases, documents, messages, evidence — to designated recipients when the owner goes silent. (Transferring crypto = sending wallet credentials as an encrypted payload; recipients access the wallets themselves.)

## This repository — the open foundation (MIT)

| In this repo | What it is |
|---|---|
| `contracts/` | The protocol contracts (Solidity 0.8.28, Hardhat). The trust-critical core is **immutable** — no proxy, no admin, no pause. |
| `sdk/` | **`@bytesbrains/maktub-sdk`** — the TypeScript developer surface (on npm). |
| `executor/` | The executor node — watches the chain and triggers delivery when a heartbeat expires. |
| `deployments/` | Canonical contract addresses per network (`base-sepolia.json` = source of truth). |
| `test/`, `scripts/` | Hardhat tests + deploy/address-generation scripts. |

### The wider ecosystem (built on this foundation)
- **`maktub_passkey`** (pub.dev) — WebAuthn PRF passkey plugin for Flutter.
- **Warden** — a standalone threshold conditional-decryption network: `warden_ffi` (pub.dev), `bytesbrains/warden` (Docker Hub).
- **The reference app** — the Flutter end-user product.

## Use cases

- **Digital estate / will** — pass wallet credentials, passwords, and documents to your heirs.
- **Safety trigger** — for hikers, field workers, and solo travelers: if you can't check in, the message you prepared reaches the people you chose.
- **Press freedom / source protection** — the protocol is content-agnostic. If a journalist goes silent, the material they prepared is delivered to the recipients they designated (editor, lawyer, trusted colleague), so their work survives them.

> **Honesty note.** *"Only for whom it is written"* means who can **read** it (encryption — strong), never who can **see that it exists** (metadata is public and permanent on-chain). Maktub claims exactly two properties — **guaranteed delivery** and **content confidentiality** — and nothing more. It is not an anonymity tool.

## How it works

1. **Create a heartbeat** — name recipients, encrypt your payload, set a check-in interval. (A small one-time creation fee in ETH; check-ins and execution are free.)
2. **Check in periodically** — free; resets the timer.
3. **If you go silent** — past the interval, an executor triggers delivery; recipients decrypt and claim. After a grace period, *anyone* (including the recipient) can trigger it, so delivery never depends on the executor market.

## Contracts

| Contract | Purpose | Immutable? |
|---|---|---|
| `MaktubCore` | Heartbeat CRUD, timer, execution (timer-triggered "Beat") | Yes |
| `MaktubFlash` | Instant-triggered delivery ("Flash") | Yes |
| `RecipientRegistry` (+ V2) | Recipient + encryption-key registration | Yes |
| `MktbToken` | ERC-20 governance token (100M max) | Yes |
| `ExecutorRewards` | Executor staking + MKTB emissions | Governed |
| `MktbGovernance` | On-chain governance + timelock | Governed |

The delivery + confidentiality core is immutable. The executor-incentive layer is governed by design. Bug fixes ship as new immutable deployments with opt-in migration; old contracts run forever.

## Quick start

```bash
npm install
npx hardhat compile
npx hardhat test
```

## Networks

- **Base Sepolia** — live testnet deployment (addresses in `deployments/base-sepolia.json`).
- **Base mainnet** — a future, audit-gated milestone.

## License

MIT.
