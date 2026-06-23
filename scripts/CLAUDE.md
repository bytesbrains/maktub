# scripts/ — Deploy & Smoke Scripts (Hardhat JS)

Scoped context for deploy/redeploy/smoke scripts. Read alongside the root [`../CLAUDE.md`](../CLAUDE.md) and [`../contracts/CLAUDE.md`](../contracts/CLAUDE.md).

## Toolchain

- Hardhat scripts in plain JS, run via `npx hardhat run scripts/<file> --network <net>`. Networks configured in `../hardhat.config.js` (`baseSepolia` 84532, `base` 8453). Needs `PRIVATE_KEY` + RPC env vars.

## Key scripts

| Script | Purpose |
|---|---|
| `deploy.js` | Main protocol deploy. |
| `deploy-flash.js`, `deploy-execution-relay.js`, `redeploy-governance.js` | Targeted (re)deploys. |
| `resume-deploy.js` | Resume a partial deploy. |
| `gen-addresses.mjs` | **Regenerates address files for mobile, sdk, and executor** from `../deployments/base-sepolia.json`. Run after every redeploy. |
| `check-balance.js`, `register-wallet-c.js` | Ops helpers. |
| `test-*.js`, `two-wallet-test.js` | On-chain smoke tests (ECIES, heartbeat, smart-wallet userop, app flow, client crypto). Transact on a live network — run deliberately. `two-wallet-test.js` is the thin entry point; its sequential phases (setup/register/create/verify) + shared helpers live in `two-wallet/`. |

## Redeploy config-refresh checklist (single-source addresses)

Addresses are single-sourced from [`../deployments/base-sepolia.json`](../deployments/base-sepolia.json). After any redeploy:

1. Update `deployments/base-sepolia.json` (the source of truth, including `stale` entries documenting deprecated deployments).
2. Run `node scripts/gen-addresses.mjs` from repo root — regenerates the generated address files in `mobile/`, `sdk/`, and `executor/`.
3. Commit the regenerated files.
4. Re-deploy the executor (Fly) and reinstall the mobile app.

**Never hand-edit address literals** in mobile/sdk/executor — they are generated.

## Conventions & gotchas

- Smoke/`test-*` scripts transact on live networks (real testnet gas) — distinct from the Hardhat unit suite in [`../test/CLAUDE.md`](../test/CLAUDE.md).
- Never commit `.env` or raw private keys (secrets-scan CI rejects them).
