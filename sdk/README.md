# @bytesbrains/maktub-sdk

TypeScript SDK for the Maktub Protocol v3 — a decentralized conditional execution engine on Base L2.

## Installation

```bash
npm install @bytesbrains/maktub-sdk ethers
```

Requires `ethers` v6 as a peer dependency.

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
