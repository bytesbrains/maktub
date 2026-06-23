# Running an Executor Node

Executors are the keepers of the Maktub Protocol. They watch the chain for expired heartbeats and trigger their execution. Without executors, timers expire and nothing happens. With executors, the protocol works.

This guide walks through setting up an executor node from a clean machine to a staked, running executor earning MKTB rewards.

---

## Table of contents

1. [What an executor actually does](#1-what-an-executor-actually-does)
2. [Prerequisites](#2-prerequisites)
3. [Install the reference executor](#3-install-the-reference-executor)
4. [Configure](#4-configure)
5. [Stake MKTB](#5-stake-mktb)
6. [Run](#6-run)
7. [What you should see](#7-what-you-should-see)
8. [Running as a service](#8-running-as-a-service)
9. [Monitoring and health](#9-monitoring-and-health)
10. [Security](#10-security)
11. [Upgrading and restarting](#11-upgrading-and-restarting)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What an executor actually does

The reference executor is a small Node.js process that:

1. Loads your wallet from `.env`.
2. Connects to Base (Sepolia or mainnet).
3. Stakes the minimum MKTB required (or instructs you to do so manually).
4. Scans historical `HeartbeatCreated` events and subscribes to new ones, so it knows which heartbeats are active.
5. Polls (every 60s by default) for heartbeats whose timers have expired.
6. Submits `execute(id)` for each expired heartbeat.
7. Logs everything.

No database. No cache. All state derives from the chain — restart the process and it picks up the world again.

You are not required to use the reference executor. The logic is simple enough to reimplement in any language. The full source is MIT-licensed at `executor/src/`.

## 2. Prerequisites

- **Node.js 18+.** Check with `node --version`.
- **A Base wallet.** An EOA (externally owned account) with:
    - A small amount of ETH on Base for gas (each `execute` costs negligible gas)
    - Enough MKTB to meet the minimum stake (see `ExecutorRewards.minimumStake()`; currently 1,000 MKTB on Sepolia)
- **An RPC endpoint** for the target chain. The public `https://sepolia.base.org` works for testnet. For mainnet production, use a paid RPC provider (Alchemy, QuickNode, Infura, Ankr, BlockPI). Public RPCs rate-limit.
- **A server or laptop** to run on. A low-cost VPS is more than enough. ARM and x86 both work.

## 3. Install the reference executor

The executor lives in the monorepo at `executor/`.

```bash
git clone https://github.com/maktub-protocol/maktub.git
cd maktub/executor
npm install
cp .env.example .env
```

## 4. Configure

Edit `.env`:

```env
PRIVATE_KEY=0xabc...              # executor wallet private key
RPC_URL=https://sepolia.base.org
NETWORK=baseSepolia                # or "base" for mainnet
```

Optional tuning:

| Variable | Default | Notes |
|---|---|---|
| `POLL_INTERVAL_SECONDS` | `60` | How often to check for expired heartbeats. Lower = faster but more RPC load. |
| `AUTO_STAKE` | `true` | Auto-approve + stake minimum MKTB on first run. |
| `AUTO_RESTAKE` | `false` | Compound earned MKTB back into your stake. |
| `START_BLOCK` | `0` | Block to begin scanning from (0 = sensible default, e.g., deployment block). |

**Do not commit your `.env` file.** A leaked private key is a full loss of funds. The repo's `.gitignore` already excludes it.

## 5. Stake MKTB

If `AUTO_STAKE=true`, the executor will approve and stake on first startup. If you prefer to do this manually, use the SDK or Basescan "write contract" interface:

```typescript
import { MaktubClient } from "@bytesbrains/maktub-sdk";
// ...
const executorRewardsAddress = /* ... */;
await maktub.approve(executorRewardsAddress, minimumStake);
await maktub.stakeForExecution(minimumStake);
```

Your stake is locked while it is above the minimum. You can unstake at any time:

```typescript
await maktub.unstake(amount);
```

Unstaking to below the minimum deactivates your executor. You can re-stake to reactivate.

## 6. Run

```bash
npm start
```

Or with the included restart-on-crash wrapper:

```bash
./start.sh
```

For a one-shot status snapshot and exit:

```bash
npm run status
```

## 7. What you should see

A healthy startup log looks like this:

```
[2026-04-14T12:00:00.000Z] ┌──────────────────────────────────────────────┐
[2026-04-14T12:00:00.000Z] │  Maktub Protocol — Executor Node             │
[2026-04-14T12:00:00.000Z] └──────────────────────────────────────────────┘
[2026-04-14T12:00:00.010Z] [conn] Connected to Base Sepolia (chainId=84532) at block 12345678
[2026-04-14T12:00:00.020Z] [conn] Wallet: 0x644a…1cE1
[2026-04-14T12:00:00.030Z] [conn] ETH balance: 0.123
[2026-04-14T12:00:00.500Z] [staking] MKTB balance: 40000000 | staked: 1000 | minimum: 1000 | active: true
[2026-04-14T12:00:00.510Z] [staking] Executor is already active. No staking needed.
[2026-04-14T12:00:01.200Z] [monitor] Scanning HeartbeatCreated events from block 11845678 to 12345678…
[2026-04-14T12:00:03.800Z] [monitor] Found 7 historical heartbeats.
[2026-04-14T12:00:04.100Z] [monitor] Tracking 5 active heartbeats.
[2026-04-14T12:00:04.200Z] [monitor] Subscribed to live events.
[2026-04-14T12:00:04.300Z] [tick] tracking=5 expired=0 nearest=3h22m executed=0
```

When a timer expires, the node will log the `execute(id)` call, the transaction hash, the block it was included in, and (if your wallet holds `CORE_ROLE`) a follow-up `distributeReward`. In normal operation, reward distribution is handled by the protocol relay. You will see rewards appear in your wallet a moment after execution.

## 8. Running as a service

The reference executor is deliberately NOT a daemon. Wrap it with whatever you already use for long-running processes:

- **systemd** (Linux):

```ini
# /etc/systemd/system/maktub-executor.service
[Unit]
Description=Maktub Executor Node
After=network.target

[Service]
Type=simple
User=maktub
WorkingDirectory=/home/maktub/maktub/executor
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/maktub-executor.log
StandardError=append:/var/log/maktub-executor.log

[Install]
WantedBy=multi-user.target
```

Enable with `sudo systemctl enable --now maktub-executor`.

- **PM2** (cross-platform):

```bash
npm install -g pm2
pm2 start npm --name maktub-executor -- start
pm2 save
pm2 startup
```

- **Docker:** a Dockerfile is at `executor/Dockerfile`. Build with `docker build -t maktub-executor .`, run with `docker run -d --env-file .env --restart unless-stopped maktub-executor`.

- **runit, supervisord, k8s, Nomad:** whatever you prefer. The process is vanilla Node.

The `start.sh` script is a minimal restart-on-crash loop for people who don't need more.

## 9. Monitoring and health

**Logs.** Every line includes an ISO-8601 timestamp and a bracketed category (`[conn]`, `[staking]`, `[monitor]`, `[tick]`, `[executor]`, `[reward]`). Pipe to your log aggregator.

**Heartbeat health signals:**

- `[tick]` lines every poll interval. Missing ticks = the node is stuck or crashed.
- `tracking=N` — how many active heartbeats you see. Should roughly match what you expect for the chain.
- `expired=N` — how many are ready to execute right now. Non-zero for more than a tick or two means something is wrong with your execution path.
- `executed=N` — cumulative successful executions in this process.

**On-chain state:**

```solidity
ExecutorRewards.rewardsEarned(yourAddress)   // cumulative
ExecutorRewards.stakes(yourAddress)          // staked principal
MktbToken.balanceOf(yourAddress)             // liquid rewards + unstaked
```

The `npm run status` command prints these along with the current emission state.

**Alerting.** We recommend alerting on:

- Process not running
- No `[tick]` line in the last 5 minutes
- ETH balance below some threshold (say, 0.01 ETH)
- Unexpected error logs (`execute failed` clusters, `NotExecutor` revert)

## 10. Security

**Private key.** The key lives in `.env`. Strict file permissions (`chmod 600`). Do not commit. Do not share. Do not reuse across networks.

**Dedicated hot wallet.** Use a wallet dedicated to executing. Hold in it only:

- The MKTB you are willing to have slashed
- A top-up of ETH for gas

Do not run an executor from a wallet that also holds long-term savings.

**Slashing.** Governance can slash executors for misbehavior. The most likely misbehavior is deliberate reward farming via self-dealing — creating throwaway heartbeats and executing them yourself. The anti-self-dealing rules (7-day minimum age, 1 check-in minimum) make this economically unprofitable, and repeated attempts could result in slashing. Run the protocol honestly.

**RPC trust.** Your RPC provider sees every transaction you submit before it is included. Use a provider you trust. For high-volume operations, consider running a Base node yourself (substantial disk and bandwidth requirements).

**Host hardening.** Standard server hygiene: keep the OS up to date, use a firewall, disable unused services, use SSH keys only, no password login.

## 11. Upgrading and restarting

The reference executor is stateless. Safe to:

- Stop the process at any moment (`SIGINT` or `SIGTERM`). It unsubscribes cleanly and exits 0.
- Restart to pick up a new version. It re-scans from `START_BLOCK`.
- Run multiple executor processes with different wallets on the same or different machines. They compete naturally.

**Do not** run two processes with the *same* wallet. They will submit duplicate transactions and waste gas.

When pulling updates:

```bash
cd maktub/executor
git pull
npm install
# (restart the service)
```

Breaking changes to the config format will be noted in the CHANGELOG.

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `PRIVATE_KEY is missing or malformed` | `.env` not loaded, or key is the wrong length | Check you are running from `executor/` and the key is 0x-prefixed, 64 hex chars |
| `RPC chain id X does not match configured NETWORK` | `RPC_URL` points to a different chain than `NETWORK` says | Fix one of them |
| `Insufficient MKTB balance` | Wallet doesn't have enough MKTB to stake | Fund the wallet |
| `execute(id) reverts with NotExecutor` | Stake fell below minimum, or you were slashed | Check `stakes(you)` and `minimumStake()`; re-stake if needed |
| `execute(id) reverts with TimerNotExpired` | Owner checked in between your poll and your tx | Harmless; next tick recomputes |
| `execute(id) reverts with AlreadyExecuted` | Another executor beat you | First-come-first-served. Consider a faster RPC or shorter poll interval. |
| Node sits at `tracking=0` but you expect heartbeats | `START_BLOCK` is wrong, or the chain is quiet | Lower `START_BLOCK`; verify on Basescan that heartbeats exist |
| Frequent RPC errors | Public RPC rate-limit | Switch to a paid provider |
| High CPU usage | Your `POLL_INTERVAL_SECONDS` is too aggressive | Raise it to 30 or 60s |

If nothing in this table matches, open an issue on the repo with your config (redacted key), a copy of the last 200 log lines, and a description of the expected vs. observed behavior.

---

## Related reading

- [Executor Economics](./economics.md)
- [Executor FAQ](./faq.md)
- [SDK Reference](../developer/sdk.md)
- [Contract Reference](../developer/contracts.md)

