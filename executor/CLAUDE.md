# executor/ — Executor Node (Node.js)

Scoped context for the executor node. Read alongside the root [`../CLAUDE.md`](../CLAUDE.md).

## What it does

Executors are the **liveness layer** of the protocol — the "miners". The node watches Base for expired heartbeats, triggers their execution (unlocking the encrypted payload for recipients), and earns **MKTB** rewards. Without executors, nothing happens when a timer expires.

## Toolchain

- Node **18+**, **ethers v6**. Plain JS (`src/*.js`).
- Deploys on Fly.io (`fly.toml`, `Dockerfile`, `start.sh`).

## Directory layout (`src/`)

| File | Purpose |
|---|---|
| `index.js` | Entry point (`--status` flag → one-shot snapshot). |
| `executor.js` | Core loop — watch chain, trigger expired heartbeats. |
| `monitor.js` | Chain monitoring / heartbeat scanning. |
| `staking.js` | Stakes the minimum MKTB to become an active executor. |
| `config.js` | Env + network config. |
| `log.js` | Logging. |
| `addresses.generated.js` | **Generated** — do not hand-edit (see below). |

## Conventions & gotchas

- **Requires `.env`** with `PRIVATE_KEY`, `RPC_URL`, `NETWORK`. Never commit `.env` (the secrets-scan CI job rejects tracked `.env` files and `PRIVATE_KEY=0x{64 hex}` patterns).
- **Addresses are generated.** `src/addresses.generated.js` is single-sourced from [`../deployments/base-sepolia.json`](../deployments/base-sepolia.json) via `node scripts/gen-addresses.mjs` (from repo root). Regenerate + re-deploy after any redeploy; never hand-edit.

## Commands (`cd executor`)

- `npm start` — run the node (needs `.env`).
- `npm run status` — one-shot status snapshot.
