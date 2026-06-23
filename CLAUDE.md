# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository. These instructions OVERRIDE default behavior — follow them exactly.

> This is the **`maktub` open foundation** (MIT) — the protocol contracts, the TypeScript SDK, and the executor. Each toolchain (`contracts/`, `sdk/`, `executor/`) has its own scoped `CLAUDE.md`; read it when working there. The end-user app, the passkey plugin, and the Warden network live in their own repos (see the topology below).

## What This Is

Maktub Protocol ($MKTB) is a decentralized conditional execution engine on Base L2.

**One primitive:** If the owner doesn't check in within a specified time interval, deliver an encrypted payload to designated recipients.

**One sentence:** `Recipients + Payload + Timer = Heartbeat`. Website: maktub.it

## Core Vision

> **It is written. And only for whom it is written.**
>
> **It is written** — delivery is inevitable. No recall, no edit; no one, not even us, can stop it. *Maktub.*
>
> **And only for whom it is written** — only the intended reader can open it. End-to-end encrypted, content-confidential, targeted.

These two sentences are the north-star and the source of all user-facing copy. They claim exactly the two properties Maktub keeps — **guaranteed delivery** and **content confidentiality** — and deliberately claim nothing else.

**Honesty guardrail (non-negotiable):** *"for whom it is written"* always means **who can *read* it** (encryption — strong), never **who can *see that it exists*** (metadata — public and permanent on-chain, weak). Copy must never imply invisibility/anonymity. Press-freedom framing is **"your work survives you"** (accident, illness, inability to deliver), never adversarial-state anonymity. (Decision D-031; the decision log is operator-local, not published in this repo.)

## What It Is NOT

- It does NOT custody, hold, or transfer any cryptocurrency or tokens.
- It does NOT manage vaults, escrow, or asset pools, nor handle ERC-20/721/1155 transfers.
- Crypto transfer = transfer wallet credentials as an encrypted payload. Recipients access wallets themselves.

## Three Equal Use Cases

1. **Safety Triggers** — for hikers, field workers, solo travelers: if you can't check in, the message you prepared reaches the people you chose. (Not a "dead man's switch" — a sealed letter that delivers when you go silent.)
2. **Press Freedom / Source Protection** — the protocol is content-agnostic; if a journalist is silenced for any reason, material they prepared is delivered to recipients they designated. Framed as protecting journalists and their sources — never as a tool against any authority.
3. **Digital Estate / Will** — seed phrases, passwords, documents to heirs.

## Cross-cutting rules — non-negotiable, every agent

> **Maktub Beat (`MaktubCore.sol`, timer-triggered) and Maktub Flash (`MaktubFlash.sol`, instant-triggered) are a two-citizen family of fully-immutable contracts — no proxy, no governance, no admin, no pause, no `selfdestruct`. The protocol layer has zero governance over its own behavior.** Both are live on Base Sepolia; mainnet is sequenced Beat-first (Flash mainnet gated on Beat being audit-green). Bug fixes ship as new immutable deployments (V2) with opt-in migration; old contracts run forever.

- **No token custody** — see *What It Is NOT* above.
- **No governance surface anywhere.** No function on any Maktub contract reads `getVotes(...)`. No compliance hooks, KYC, identity tiering, or subscription billing at the protocol layer — apps handle all of that. Any proposed governance/upgrade/admin/new-trigger must be redirected to a new immutable deployment or a new immutable citizen (gated on [`docs/developer/protocol-family.md`](docs/developer/protocol-family.md) §9).
- **Simplicity in the protocol, complexity in the app.** Purpose over profit, immutable core, permanence (no recalls), fair launch.
- **No fiat references** — docs/decisions/contracts are wei/ETH-native. No `$`, `USD`, or fiat amounts.
- Contract-layer detail (invariants, contract table, data structures, economics) lives in [`contracts/CLAUDE.md`](contracts/CLAUDE.md).

## Topology — scoped context map

**This repo (the open foundation).** Each toolchain has its own scoped `CLAUDE.md` — read it for the area you're working in.

| Path | Stack | Scoped context | Purpose |
|---|---|---|---|
| `contracts/v3/` | Solidity 0.8.28, Hardhat | [`contracts/CLAUDE.md`](contracts/CLAUDE.md) | Protocol contracts (only `v3/` is live). |
| `test/` | Hardhat + Chai | [`test/CLAUDE.md`](test/CLAUDE.md) | Contract tests; integration hits live Sepolia. |
| `scripts/` | Hardhat scripts (JS) | [`scripts/CLAUDE.md`](scripts/CLAUDE.md) | Deploy, redeploy, on-chain smoke tests. |
| `sdk/` | TypeScript, ethers v6 | [`sdk/CLAUDE.md`](sdk/CLAUDE.md) | `@bytesbrains/maktub-sdk` — public developer surface (npm). |
| `executor/` | Node 18+, ethers v6 | [`executor/CLAUDE.md`](executor/CLAUDE.md) | Executor node — watches chain, triggers delivery. |
| `deployments/` | JSON | — | Canonical contract addresses per network (`base-sepolia.json` = source of truth). |
| `vectors/` | JSON | — | Canonical cross-language reading-key vectors (the byte-for-byte contract). |

**The wider ecosystem (separate repos / published artifacts).**

| Component | Where |
|---|---|
| Passkey plugin | `maktub_passkey` (pub.dev) |
| Warden — threshold conditional-decryption network | `warden_ffi` (pub.dev), `bytesbrains/warden` (Docker Hub) |
| Reference end-user app (Flutter) | its own repo (BSL) |

License: **MIT** (everything in this repo).

## Key docs

- [`docs/developer/protocol-family.md`](docs/developer/protocol-family.md) — full protocol topology + invariants (§4) + new-citizen gate (§9).
- Canonical protocol spec: [`docs/developer/protocol-spec.md`](docs/developer/protocol-spec.md) — the technical specification as shipped.
- The architectural decision log (D-021 family architecture, D-031 honesty guardrail) and the v1 encryption-layer research are **operator-local** (not published in this repo).

## Contributing

- Work on a branch and open a PR; never push directly to `main`. CI (contract compile + test, secret scan) must be green before merge.
