# Deploying Your Own App

The protocol contracts and SDK are MIT-licensed. You can fork the reference application, build a completely different frontend, or deploy the protocol to your own infrastructure.

This guide walks through three deployment scenarios:

1. **Self-host the reference web app** — run your own instance pointing at the official contracts.
2. **Build a new frontend from scratch** — use the SDK against the official contracts.
3. **Deploy the protocol contracts yourself** — run an isolated deployment (testnet, enterprise fork, alternate chain).

---

## Table of contents

1. [Licensing summary](#1-licensing-summary)
2. [Self-hosting the reference app](#2-self-hosting-the-reference-app)
3. [Building from scratch](#3-building-from-scratch)
4. [Deploying the protocol contracts](#4-deploying-the-protocol-contracts)
5. [Runtime dependencies](#5-runtime-dependencies)
6. [Branding and trademark](#6-branding-and-trademark)

---

## 1. Licensing summary

| Component | License | What it means |
|---|---|---|
| `contracts/v3/` | MIT | Deploy, modify, fork freely. |
| `sdk/` (@bytesbrains/maktub-sdk) | MIT | Use in any application. |
| `executor/` | MIT | Run any number of executors. |
| `app/` (reference web) | BSL 1.1 | Non-production use, or commercial use with restrictions. Converts to MIT two years after the deployment date stamped in the license header. |
| `mobile/` (reference mobile) | BSL 1.1 | Same as above. |
| Documentation | CC BY 4.0 | Free to adapt with attribution. |

**The protocol itself is permissively licensed from day one.** The reference applications have a two-year commercial restriction only because we want to protect the team's initial engineering investment. You can, however, build an entirely different frontend using the MIT-licensed SDK and contracts with zero restrictions.

If you are unsure whether your intended use is compatible with BSL, see the license text in the respective directories or contact the team.

## 2. Building your own app on the protocol

There is no public reference-app repository to clone — the reference web and mobile apps are maintained in a **separate private repository**. The protocol, the contracts, and the SDK are what you build against. Build your own frontend on top of the deployed Maktub contracts using `@bytesbrains/maktub-sdk`; see [§3 Building from scratch](#3-building-from-scratch) for the app skeleton. This section covers the configuration any such app needs.

### 2.1 Install the SDK

```bash
npm install @bytesbrains/maktub-sdk ethers
```

### 2.2 Configure

Provide your app with the deployed contract addresses and an RPC endpoint (for example, via an env file).

```env
VITE_CHAIN_ID=84532
VITE_RPC_URL=https://sepolia.base.org
VITE_MAKTUB_CORE=0x46f491eD5A82dA53Eb077aE35C4C5ed328864331
VITE_RECIPIENT_REGISTRY=0xfF66eEbFCf0C27f682B84500731752AaCAc7BBc9
VITE_MKTB_TOKEN=0x068d9176514C868d8fB43CE84A775b63cf223C5D
VITE_EXECUTOR_REWARDS=0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba
VITE_IPFS_GATEWAY=https://ipfs.io
VITE_IPFS_PINNING_API=...
```

Point at mainnet by changing the chain ID to `8453` and using the mainnet addresses (published when deployed).

### 2.3 Build and deploy

A typical Vite/React build produces a static bundle in `dist/`. Deploy it anywhere static hosting is available: Cloudflare Pages (zero-cost), Vercel, Netlify, your own S3 bucket, an nginx container.

For Cloudflare Pages:

```bash
npx wrangler pages deploy dist/ --project-name=my-maktub-app
```

### 2.4 Notes on running your own app

- You are responsible for tracking new SDK releases and pulling updates when one is cut.
- You are responsible for the domain name, DNS, TLS certificate, and uptime.
- You are not responsible for the smart contracts — those run regardless of where the frontend is hosted.
- Users connecting to your instance are trusting your build. Publish your source so users can audit what they are running.

## 3. Building from scratch

If you want a frontend that does not inherit the reference UX, build a new application directly against the SDK.

### 3.1 Minimum viable app

The smallest useful Maktub app has three screens:

1. **Sign in.** Connect a wallet or sign in with email.
2. **List heartbeats.** Show the user's existing heartbeats with their status and check-in state.
3. **Create heartbeat.** A form for recipients, payload, and interval.

This can be built in a day in any framework that supports ethers.

### 3.2 Stack choices

No stack is required. The SDK is plain TypeScript.

Recommended:

- React / Next.js / Remix / Svelte / Vue — whatever you prefer
- ethers v6 (peer dep of the SDK)
- A wallet connector library: RainbowKit, wagmi, ConnectKit, Privy, Dynamic, or raw EIP-1193
- A state library if your app is non-trivial: TanStack Query, Zustand, or similar
- For client-side encryption: the ECIES crypto ships in `@bytesbrains/maktub-sdk` — no external encryption network needed. (For the optional Veil time-lock, the SDK pulls in `warden_ffi`/WASM; preview.)

### 3.3 Identity and account abstraction

For a consumer-friendly app, account abstraction is nearly mandatory. Options:

- **Privy.** Email + social login, embedded wallets, production-ready. Paid at scale.
- **Dynamic.** Similar to Privy. Paid at scale.
- **web3auth.** OSS + paid tiers.
- **Safe{Core}.** Smart-contract wallets with social recovery. Self-hosted option.
- **Coinbase Smart Wallet.** Free for users, open standards-based.

Any of these can produce an ethers-compatible signer that the Maktub SDK accepts.

### 3.4 Component examples

See the reference web app (separate repository) for copy-paste-friendly implementations of:

- Heartbeat list cards
- Check-in button with confirmation flow
- Create flow with interval picker
- Recipient registration onboarding
- Executor dashboard (less useful for consumer apps, but instructive)

Components are under BSL; you may study them freely and rewrite equivalent functionality under your own license.

## 4. Deploying the protocol contracts

Rare but supported. You might deploy your own copy of the contracts if:

- You want an isolated testnet for a specific partner integration
- You are running Maktub on a chain that is not yet supported (another Ethereum L2, a dedicated app-chain)
- You are building an enterprise deployment that must be legally separate from the public protocol
- You are auditing the deployment process

### 4.1 Prerequisites

- Solidity 0.8.28
- Hardhat (or Foundry — ignition scripts are Hardhat-based)
- Node.js 20+
- A wallet with ETH on the target chain
- Patience

### 4.2 Deployment order

There is a circular dependency between `MaktubCore` and `ExecutorRewards`. Deploy in this order:

1. `MktbToken` — the token must exist first.
2. `TimelockController` — the timelock for governance.
3. `MktbGovernance` — wired to the token and timelock.
4. `ExecutorRewards` — wired to the token; `maktubCore` address left unset.
5. `RecipientRegistry` — no dependencies.
6. `MaktubCore` — wired to `RecipientRegistry` and `ExecutorRewards`.
7. Call `ExecutorRewards.setMaktubCore(maktubCoreAddress)` to close the loop.
8. Grant `CORE_ROLE` on `ExecutorRewards` to the reward relay (often `MaktubCore` itself).
9. Grant `GOVERNANCE_ROLE` on `ExecutorRewards` to the timelock.
10. Call `ExecutorRewards.renounceAdmin()` (optional but recommended) to remove superuser risk.
11. Transfer `MktbToken` ownership (the minter) to a multisig or governance timelock.

The included `ignition/` scripts automate most of this. Inspect them carefully before running against a non-test network.

### 4.3 Configuration choices

| Parameter | Recommendation |
|---|---|
| `creationFee` | A small one-time creation fee, denominated in wei. Set it directly in wei; use a script like `ignition/configure-fee.js`. |
| `feeReceiver` | A multisig controlled by your treasury or governance. Never an EOA. |
| `minimumStake` (ExecutorRewards) | Depends on token price and economics. Sepolia default: 1,000 MKTB. |
| `rewardPerExecution` | Tune to spread the year's emission budget across expected execution volume. |
| Timelock delay | 48 hours for production. Shorter for testnet. |
| Governance quorum | 4% of total supply (the OpenZeppelin default). |

### 4.4 Post-deployment

- Verify all contracts on the block explorer. Unverified bytecode is a red flag for users and collaborators.
- Publish the deployed addresses in your app's configuration and in the SDK.
- Update the executor software's address configuration.
- Run integration tests against your new deployment before pointing real users at it.
- Document the deployment: deployer, block numbers, commit hash of source, time of deployment. Make this record public.

## 5. Runtime dependencies

An end-to-end Maktub deployment requires:

| Dependency | Purpose | Can it be replaced? |
|---|---|---|
| Base L2 (or another EVM chain) | Host for the smart contracts | Yes, any EVM chain |
| Ethereum (for L1 fallback) | Base's settlement layer | No (if using Base) |
| In-app ECIES (in the SDK) | Per-recipient payload encryption (always on, on-device) | Yes; any scheme the recipients agree on |
| Warden / Veil federation | Optional time-lock (preview); withholds the decryption gate until execution | Optional; only needed if your app offers the time-lock |
| IPFS | Oversize-media payload storage (inline payloads need none) | Replaceable by any content-addressed storage |
| Arweave | Permanent payload storage | Optional; redundancy |
| Executor node operators | Liveness for execution | You can run your own if the public network is not live |
| MKTB token | Executor staking + governance | Required for the economic model; deploy your own fork if needed |

For an isolated deployment (e.g., an enterprise fork), you likely need to run:

- A private IPFS cluster (only if you allow oversize-media payloads)
- Your own Warden federation nodes — only if your app offers the optional Veil time-lock; the always-on ECIES encryption needs no nodes at all
- Executor nodes that watch your deployment's contracts
- A web frontend and possibly a mobile app

## 6. Branding and trademark

The **Maktub** name and wordmark are the team's trademarks. You may:

- Refer to Maktub Protocol by name in your documentation, marketing, and integrations ("built on Maktub," "powered by Maktub")
- Fork the code and build alternative clients
- Deploy the MIT-licensed contracts for any purpose

You may not:

- Name your fork "Maktub" in a way that confuses users into thinking it is the reference protocol
- Use the logo or wordmark to endorse your fork without written permission
- Call your fork "the official Maktub"

If you are unsure, a short email to the team is the easiest way to get clarity. We want a healthy ecosystem of forks and integrations; we do not want users deceived about what they are using.

---

## Related reading

- [Integration Guide](./integration.md)
- [SDK Reference](./sdk.md)
- [Contract Reference](./contracts.md)
- [Running an Executor Node](../executor/running-a-node.md)

