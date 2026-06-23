# Maktub Executor Node

Run a Maktub executor. Watch the chain for expired heartbeats, trigger their
execution, and earn **$MKTB** rewards.

Executors are the miners of the Maktub Protocol: they provide the liveness
guarantee that makes the heartbeat primitive trustworthy. Without executors,
nothing happens when a timer expires. With executors, the protocol works.

> **Protocol in one sentence:** `Recipients + Payload + Timer = Heartbeat`.
> If the owner doesn't check in within the interval, any registered executor
> can trigger execution and unlock the encrypted payload for the recipients.

---

## What this node does

1. Loads your wallet from `.env`.
2. Connects to Base (Sepolia or mainnet).
3. Stakes the minimum `MKTB` required to become an active executor (or asks
   you to do it manually if `AUTO_STAKE=false`).
4. Scans past `HeartbeatCreated` events and subscribes to live events, so it
   always knows which heartbeats are currently active.
5. On a polling interval (default 60s), checks which heartbeats have expired
   timers and submits `execute(id)` for each.
6. Logs everything: heartbeats tracked, transactions sent, rewards reported.
7. Shuts down cleanly on `Ctrl+C`.

Everything is derived from the chain. No database. No cache files.
Lose the process, restart it, and it picks up the world again.

---

## Prerequisites

- **Node.js 18+** (`node --version`)
- **A Base wallet** with:
  - A little **ETH on Base** for gas (`execute()` costs negligible gas).
  - Enough **MKTB** to meet the minimum stake. Check the current minimum:
    [`ExecutorRewards.minimumStake()`](https://sepolia.basescan.org/address/0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba#readContract).
- An **RPC endpoint** for the target chain (the public `https://sepolia.base.org`
  works for Sepolia; for production use a paid provider).

---

## Setup

```bash
git clone <this repo>
cd executor
npm install
cp .env.example .env
```

Edit `.env` and fill in:

```env
PRIVATE_KEY=0xabc…            # executor wallet private key
RPC_URL=https://sepolia.base.org
NETWORK=baseSepolia            # or "base" for mainnet
```

Optional tuning:

| Variable                 | Default | Notes                                                  |
| ------------------------ | ------- | ------------------------------------------------------ |
| `POLL_INTERVAL_SECONDS`  | `60`    | How often to check for expired heartbeats.             |
| `AUTO_STAKE`             | `true`  | Auto-approve + stake minimum MKTB on first run.        |
| `AUTO_RESTAKE`           | `false` | Compound earned MKTB back into your stake.             |
| `START_BLOCK`            | `0`     | Block to begin scanning from (0 = sensible default).   |

---

## Run

```bash
npm start
```

Or with the included restart-on-crash wrapper:

```bash
./start.sh
```

To just print a one-shot status snapshot and exit:

```bash
npm run status
```

---

## What you'll see

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

When a timer expires the node will log the `execute(id)` call, the tx hash,
the block it was included in, and — if your wallet holds `CORE_ROLE` — a
follow-up `distributeReward` tx. In normal operation, reward distribution is
handled by the protocol relay, so most executors will only ever submit
`execute()` themselves and see rewards show up in their wallet a moment later.

---

## Economics

- **Reward pool:** 35% of 100M MKTB supply = **35,000,000 MKTB** over ~10 years.
- **Halving schedule:** Y1 ~7M, Y2 ~3.5M, Y3 ~1.75M, … Y10 ~13.6K. The
  remainder is a governance-managed reserve.
- **Per-execution reward:** set by governance (see
  [`ExecutorRewards.currentRewardAmount()`](https://sepolia.basescan.org/address/0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba#readContract)).
  Tuned so the yearly emission budget matches observed execution volume.
- **Anti-self-dealing:** a heartbeat must be at least **7 days old** AND have
  at least **1 real check-in** to earn rewards on execution. Creating and
  immediately executing a throwaway heartbeat earns nothing.
- **Slashing:** governance can slash malicious executors. Don't try to race
  yourself into useless heartbeats — you'll lose your stake for no gain.

Your earnings are visible on-chain at any time:

```solidity
ExecutorRewards.rewardsEarned(yourAddress)   // cumulative
ExecutorRewards.stakes(yourAddress)          // staked principal
MktbToken.balanceOf(yourAddress)             // liquid rewards
```

---

## Architecture

```
executor/
├── package.json
├── README.md
├── start.sh                  # restart-on-crash wrapper
├── .env.example
└── src/
    ├── index.js              # entry point: connect, stake, monitor, loop, shutdown
    ├── config.js             # env loading + chain config (addresses live here)
    ├── log.js                # timestamped console logger
    ├── staking.js            # ensureStaked(), restakeRewards()
    ├── monitor.js            # historical scan + live event subscription
    └── executor.js           # execute(id) + best-effort distributeReward()
```

Dependencies: **ethers v6** and **dotenv**. That's it.

---

## Operations

**Funding the wallet.** Send Base ETH for gas and MKTB for the stake. On
Sepolia, MKTB can be bridged from the deployer or requested from the protocol
team.

**Stopping the node.** `Ctrl+C` once. The node unsubscribes from the
provider, clears its poll interval, and exits 0.

**Running as a service.** This script is deliberately NOT a daemon. Wrap it
with whatever you already use — `systemd`, `pm2`, `docker`, `supervisord`,
`runit`. The `start.sh` script is a minimal restart-on-crash loop for people
who don't need more.

**Monitoring.** All output is plain `console.log` with ISO-8601 timestamps.
Pipe it into your log aggregator of choice.

**Security.** Your private key sits in `.env`. Don't commit it. Don't reuse
it across networks. Consider using a dedicated hot wallet with only the MKTB
you're willing to have slashed + a little gas top-up.

---

## Troubleshooting

- **"PRIVATE_KEY is missing or malformed."** `.env` not loaded or key is the
  wrong length. Run from the `executor/` directory.
- **"RPC chain id … does not match configured NETWORK"** — Your `RPC_URL` and
  `NETWORK` disagree. Fix one.
- **"Insufficient MKTB balance"** — Fund the wallet with enough MKTB to meet
  the minimum stake.
- **`execute(id)` reverts with `NotExecutor`** — Your wallet isn't an active
  executor. Check `stakes(you)` and `minimumStake()`.
- **`execute(id)` reverts with `TimerNotExpired`** — The owner checked in
  between our poll and our tx. Harmless; next tick will recompute.
- **Many `execute` failures with "already executed"** — Another executor beat
  you to it. Rewards are first-come, first-served. Consider a faster RPC.

---

## Contracts (Base Sepolia)

| Contract           | Address                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| MaktubCore         | [`0x46f491eD5A82dA53Eb077aE35C4C5ed328864331`](https://sepolia.basescan.org/address/0x46f491eD5A82dA53Eb077aE35C4C5ed328864331) |
| ExecutorRewards    | [`0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba`](https://sepolia.basescan.org/address/0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba) |
| MktbToken          | [`0x068d9176514C868d8fB43CE84A775b63cf223C5D`](https://sepolia.basescan.org/address/0x068d9176514C868d8fB43CE84A775b63cf223C5D) |
| RecipientRegistry  | [`0xfF66eEbFCf0C27f682B84500731752AaCAc7BBc9`](https://sepolia.basescan.org/address/0xfF66eEbFCf0C27f682B84500731752AaCAc7BBc9) |

MIT license. Fork it, run ten copies, compete with yourself. That's the point.
