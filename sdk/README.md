# @bytesbrains/maktub-sdk

TypeScript SDK for the Maktub Protocol v3 — a decentralized conditional execution engine on Base L2.

## Installation

```bash
npm install @bytesbrains/maktub-sdk ethers
```

Requires `ethers` v6 as a peer dependency.

## Entry points

The package ships both ESM and CommonJS, and is split so you can take only the
part you need.

| Import | Contains | Pulls in |
|---|---|---|
| `@bytesbrains/maktub-sdk` | `MaktubClient`, contract wrappers, crypto, types, errors | `ethers` |
| `@bytesbrains/maktub-sdk/crypto` | Reading-key derivation, ECIES, hybrid envelope | `@noble/*` only |
| `@bytesbrains/maktub-sdk/veil` | Veil — time-confidential Beats (**preview**) | WebAssembly; **Node only** |

```ts
// Everything.
import { MaktubClient } from "@bytesbrains/maktub-sdk";

// Just the crypto — no ethers, no WASM.
import { deriveReadingKeyFromPrfOutput } from "@bytesbrains/maktub-sdk/crypto";
```

**Browser clients should import from `/crypto`.** It has no WebAssembly
anywhere in its module graph, which means the origin doing key derivation does
not need `wasm-unsafe-eval` in its CSP and can keep `script-src 'self'`. That
matters more than the bundle size: a reading key is long-lived and its published
half is write-once, so a single injected script that reads it decrypts
everything that user has ever received, with no way to rotate.

`/veil` is Node-only by construction — its pairing crypto is wasm-bindgen glue
built for the nodejs target, which reads the `.wasm` off disk at import time.

Two data files are also published, for language ports and for downstreams that
regenerate their own constants:

```js
require("@bytesbrains/maktub-sdk/vectors/reading-key.json");        // cross-language vectors
require("@bytesbrains/maktub-sdk/deployments/base-sepolia.json");   // address carrier
```

## Quick Start

```typescript
import { MaktubClient } from "@bytesbrains/maktub-sdk";
import { BrowserProvider } from "ethers";

// Connect via browser wallet
const browserProvider = new BrowserProvider(window.ethereum);
const signer = await browserProvider.getSigner();

const maktub = new MaktubClient({ provider: browserProvider, signer });

// Create a heartbeat with 180-day interval
const { heartbeatId } = await maktub.createHeartbeat({
  recipients: ["0xRecipient1...", "0xRecipient2..."],
  payload: "0x...", // IPFS CID as bytes
  interval: 180 * 24 * 3600, // 180 days in seconds
});

// Check in to reset the timer (free, gas only)
await maktub.checkIn(heartbeatId);

// Query heartbeat status
const info = await maktub.getHeartbeat(heartbeatId);
const remaining = await maktub.timeRemaining(heartbeatId);
const expired = await maktub.isExpired(heartbeatId);
```

## Core Concepts

**Heartbeat** — the protocol's single primitive: `Recipients + Payload + Timer = Heartbeat`. If the owner doesn't check in within the specified interval, the encrypted payload becomes decryptable by recipients.

## API Reference

### MaktubClient

The high-level client wrapping all protocol interactions.

#### Heartbeat Operations

| Method | Description |
|---|---|
| `createHeartbeat(params)` | Create a new heartbeat (small one-time fee, in ETH) |
| `checkIn(id)` | Reset the timer (free) |
| `execute(id)` | Execute an expired heartbeat (executor only) |
| `getHeartbeat(id)` | Get heartbeat data |
| `timeRemaining(id)` | Seconds until expiration |
| `isExpired(id)` | Check if timer has expired |
| `updateRecipients(id, recipients)` | Update recipient list |
| `updateInterval(id, interval)` | Update check-in interval |
| `deactivate(id)` | Permanently deactivate |

#### Recipient Operations

| Method | Description |
|---|---|
| `registerRecipient(prePublicKey)` | Register as a recipient with an ECIES secp256k1 public key (the `prePublicKey` arg is named for legacy reasons) |
| `updatePrePublicKey(newKey)` | Rotate the caller's ECIES public key |
| `isRecipientRegistered(account)` | Check registration status |
| `getPrePublicKey(account)` | Get recipient's ECIES public key |

#### Executor & Staking

| Method | Description |
|---|---|
| `stakeForExecution(amount)` | Stake MKTB to become executor |
| `unstake(amount)` | Withdraw staked MKTB |
| `isActiveExecutor(account)` | Check executor status |
| `getExecutorInfo(account)` | Get staking and reward info |
| `getEmissionInfo()` | Get emission schedule data |

#### Token & Governance

| Method | Description |
|---|---|
| `balanceOf(account)` | Get MKTB balance |
| `approve(spender, amount)` | Approve MKTB spending |
| `delegateVotes(delegatee)` | Delegate voting power |
| `propose(targets, values, calldatas, desc)` | Create governance proposal |
| `castVote(proposalId, support)` | Vote on proposal |

### Direct Contract Access

For advanced usage, access individual contract wrappers directly:

```typescript
const maktub = new MaktubClient({ provider, signer });

// Access underlying typed contract wrappers
maktub.core       // MaktubCoreContract
maktub.registry   // RecipientRegistryContract
maktub.token      // MktbTokenContract
maktub.rewards    // ExecutorRewardsContract
maktub.governance // MktbGovernanceContract

// Access raw ethers Contract for custom calls
maktub.core.contract.on("HeartbeatCreated", (id, owner, recipients, interval) => {
  console.log(`New heartbeat #${id} by ${owner}`);
});
```

### Custom Addresses

For local development or custom deployments:

```typescript
const maktub = new MaktubClient({
  provider,
  signer,
  addresses: {
    maktubCore: "0x...",
    recipientRegistry: "0x...",
    mktbToken: "0x...",
    executorRewards: "0x...",
    mktbGovernance: "0x...",
  },
});
```

## Supported Networks

| Network | Chain ID | Status |
|---|---|---|
| Base Mainnet | 8453 | Pending deployment |
| Base Sepolia | 84532 | Pending deployment |
| Localhost | 31337 | Development |

## License

MIT
