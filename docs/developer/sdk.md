# SDK Reference

The `@bytesbrains/maktub-sdk` package provides a typed, ergonomic TypeScript API for interacting with Maktub Protocol v3 from Node, browser, React Native, and Flutter FFI targets.

This document is the public API reference. For end-to-end examples, see [Code Examples](./examples.md).

---

## Table of contents

1. [Installation](#1-installation)
2. [Quick start](#2-quick-start)
3. [`MaktubClient`](#3-maktubclient)
4. [Direct contract wrappers](#4-direct-contract-wrappers)
5. [Types](#5-types)
6. [Constants and addresses](#6-constants-and-addresses)
7. [Errors](#7-errors)
8. [Network configuration](#8-network-configuration)
9. [Read-only vs signed usage](#9-read-only-vs-signed-usage)
10. [Event subscriptions](#10-event-subscriptions)

---

## 1. Installation

```bash
npm install @bytesbrains/maktub-sdk ethers
```

The SDK declares `ethers@^6` as a peer dependency. Install it alongside the SDK.

Targets:

- Node.js 18+
- Modern browsers (ESM build, tree-shakeable)
- React Native (with `ethers` mobile-compatible build)

## 2. Quick start

**Browser, with an injected wallet:**

```typescript
import { MaktubClient } from "@bytesbrains/maktub-sdk";
import { BrowserProvider } from "ethers";

const browserProvider = new BrowserProvider(window.ethereum);
const signer = await browserProvider.getSigner();

const maktub = new MaktubClient({
  provider: browserProvider,
  signer,
});

const { heartbeatId } = await maktub.createHeartbeat({
  recipients: ["0xAlice...", "0xBob..."],
  payload: "0x" + /* IPFS CID bytes */ "...",
  interval: 180 * 24 * 3600, // 180 days
});

await maktub.checkIn(heartbeatId);
```

**Node.js, with a private-key wallet:**

```typescript
import { MaktubClient } from "@bytesbrains/maktub-sdk";
import { JsonRpcProvider, Wallet } from "ethers";

const provider = new JsonRpcProvider("https://sepolia.base.org");
const signer = new Wallet(process.env.PRIVATE_KEY!, provider);

const maktub = new MaktubClient({ provider, signer });
const info = await maktub.getHeartbeat(42n);
```

## 3. `MaktubClient`

The high-level entry point. Wraps all five contracts behind a single object.

### Constructor

```typescript
new MaktubClient(config: MaktubClientConfig);

interface MaktubClientConfig {
  provider: Provider;
  signer?: Signer;              // omit for read-only
  addresses?: ContractAddresses; // omit to auto-resolve from chainId
}
```

If `addresses` is omitted, the client auto-detects the network from `provider.getNetwork()` and resolves addresses from the built-in registry (Base Mainnet, Base Sepolia, Localhost).

### Initialization

Address resolution happens lazily on the first contract call. For eager initialization (to surface network errors early):

```typescript
await maktub.init();
```

### Heartbeat operations

| Method | Returns | Description |
|---|---|---|
| `createHeartbeat(params, feeOverride?)` | `{ tx, heartbeatId }` | Create a heartbeat. Sends `creationFee` ETH; pass `feeOverride` (bigint wei) to send extra. |
| `checkIn(id)` | `ContractTransactionResponse` | Reset the timer (free). |
| `execute(id)` | `ContractTransactionResponse` | Execute an expired heartbeat. Caller must be an active executor. |
| `updateRecipients(id, recipients)` | `ContractTransactionResponse` | Replace recipient list. Resets timer. |
| `updateInterval(id, seconds)` | `ContractTransactionResponse` | Change the interval. Does not reset timer. |
| `deactivate(id)` | `ContractTransactionResponse` | Permanently deactivate. Irreversible. |
| `getHeartbeat(id)` | `HeartbeatInfo` | Full heartbeat data. |
| `isExpired(id)` | `boolean` | `true` if the timer has expired. |
| `timeRemaining(id)` | `bigint` | Seconds remaining; 0 if expired. |
| `heartbeatCount()` | `bigint` | Total heartbeats created on this chain. |
| `creationFee()` | `bigint` | Current fee in wei. |

### Recipient operations

| Method | Returns | Description |
|---|---|---|
| `registerRecipient(prePublicKey)` | `ContractTransactionResponse` | Register the caller as a recipient with an ECIES secp256k1 public key. (The `prePublicKey` arg is named for legacy reasons but holds an ECIES key.) |
| `updatePrePublicKey(newKey)` | `ContractTransactionResponse` | Rotate the caller's ECIES public key. |
| `isRecipientRegistered(address)` | `boolean` | Check registration. |
| `getPrePublicKey(address)` | `string` (hex bytes) | Get the stored ECIES public key. |

### Executor operations

| Method | Returns | Description |
|---|---|---|
| `stakeForExecution(amount)` | `ContractTransactionResponse` | Stake MKTB. Requires prior `approve`. |
| `unstake(amount)` | `ContractTransactionResponse` | Withdraw staked MKTB. |
| `isActiveExecutor(address)` | `boolean` | True if the address meets minimum stake. |
| `getExecutorInfo(address)` | `ExecutorInfo` | Stake amount, active status, rewards earned. |
| `getEmissionInfo()` | `EmissionInfo` | Emission schedule, minimum stake, total staked. |

### Token operations

| Method | Returns | Description |
|---|---|---|
| `balanceOf(address)` | `bigint` | MKTB balance in wei. |
| `approve(spender, amount)` | `ContractTransactionResponse` | Approve MKTB spending (needed before staking). |
| `delegateVotes(delegatee)` | `ContractTransactionResponse` | Activate voting power. |
| `getTokenInfo()` | `TokenInfo` | Name, symbol, decimals, supply, cap. |

### Governance operations

| Method | Returns | Description |
|---|---|---|
| `propose(targets, values, calldatas, description)` | `ContractTransactionResponse` | Create a proposal. |
| `castVote(proposalId, support)` | `ContractTransactionResponse` | Vote 0=Against, 1=For, 2=Abstain. |
| `getProposalState(proposalId)` | `ProposalState` | Current lifecycle state. |

### Direct contract access

Each wrapper is exposed for advanced use:

```typescript
maktub.core       // MaktubCoreContract
maktub.registry   // RecipientRegistryContract
maktub.token      // MktbTokenContract
maktub.rewards    // ExecutorRewardsContract
maktub.governance // MktbGovernanceContract
```

Each wrapper exposes a `.contract` property returning the underlying `ethers.Contract` for event subscriptions or unusual calls.

## 4. Direct contract wrappers

For callers that don't want the single-object API.

```typescript
import {
  MaktubCoreContract,
  RecipientRegistryContract,
  MktbTokenContract,
  ExecutorRewardsContract,
  MktbGovernanceContract,
} from "@bytesbrains/maktub-sdk";

const core = new MaktubCoreContract(coreAddress, provider, signer);
const { tx, heartbeatId } = await core.createHeartbeat({
  recipients: ["0x..."],
  payload: "0x...",
  interval: 86400,
});
```

Each wrapper mirrors the on-chain function surface of its corresponding contract one-to-one. See [Contract Reference](./contracts.md) for the full function list.

## 5. Types

From `@bytesbrains/maktub-sdk`:

### `ContractAddresses`

```typescript
interface ContractAddresses {
  maktubCore: string;
  recipientRegistry: string;
  mktbToken: string;
  executorRewards: string;
  mktbGovernance: string;
}
```

### `NetworkConfig`

```typescript
interface NetworkConfig {
  chainId: number;
  name: string;
  contracts: ContractAddresses;
}
```

### `HeartbeatInfo`

```typescript
interface HeartbeatInfo {
  owner: string;
  recipients: string[];
  payload: string;          // hex-encoded bytes (the CID)
  interval: bigint;
  lastCheckIn: bigint;
  createdAt: bigint;
  checkInCount: bigint;
  executed: boolean;
  deactivated: boolean;
}
```

### `CreateHeartbeatParams` / `CreateHeartbeatResult`

```typescript
interface CreateHeartbeatParams {
  recipients: string[];
  payload: string | Uint8Array;
  interval: number | bigint;  // seconds
}

interface CreateHeartbeatResult {
  tx: ContractTransactionResponse;
  heartbeatId: bigint;
}
```

### `ExecutorInfo`

```typescript
interface ExecutorInfo {
  stakeAmount: bigint;
  isActive: boolean;
  rewardsEarned: bigint;
}
```

### `EmissionInfo`

```typescript
interface EmissionInfo {
  currentYear: bigint;
  rewardPerExecution: bigint;
  totalDistributed: bigint;
  remainingPool: bigint;
  totalStaked: bigint;
  minimumStake: bigint;
  paused: boolean;
}
```

### `TokenInfo`

```typescript
interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  maxSupply: bigint;
}
```

### Enums

```typescript
enum ProposalState {
  Pending = 0,
  Active = 1,
  Canceled = 2,
  Defeated = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}

enum VoteType {
  Against = 0,
  For = 1,
  Abstain = 2,
}
```

## 6. Constants and addresses

```typescript
import {
  BASE_MAINNET,
  BASE_SEPOLIA,
  LOCALHOST,
  NETWORKS,
  getNetworkConfig,
  MAKTUB_CORE_ABI,
  RECIPIENT_REGISTRY_ABI,
  MKTB_TOKEN_ABI,
  EXECUTOR_REWARDS_ABI,
  MKTB_GOVERNANCE_ABI,
} from "@bytesbrains/maktub-sdk";
```

- `BASE_MAINNET`, `BASE_SEPOLIA`, `LOCALHOST` — `NetworkConfig` objects with chain IDs and deployed addresses.
- `NETWORKS` — a map from chain ID to `NetworkConfig`.
- `getNetworkConfig(chainId: number): NetworkConfig | undefined`.
- ABI exports are the full JSON ABIs for each contract — useful if you need to decode logs or interact via a non-ethers stack (web3.js, viem).

## 7. Errors

The SDK throws typed errors for known failure modes. All extend `MaktubError` (which extends `Error`).

```typescript
import {
  MaktubError,
  SignerRequiredError,
  UnsupportedNetworkError,
  HeartbeatNotFoundError,
  ContractRevertError,
  NetworkDetectionError,
} from "@bytesbrains/maktub-sdk";

try {
  await maktub.checkIn(999_999n);
} catch (err) {
  if (err instanceof HeartbeatNotFoundError) {
    console.log("No such heartbeat.");
  } else if (err instanceof ContractRevertError) {
    console.log("Revert:", err.code, err.args);
  } else {
    throw err;
  }
}
```

- `SignerRequiredError` — a write method was called without a signer.
- `UnsupportedNetworkError` — the detected chain ID has no configured addresses.
- `HeartbeatNotFoundError` — the id does not correspond to an existing heartbeat.
- `ContractRevertError` — a contract reverted. `.code` is the parsed custom error selector name (e.g., `"NotOwner"`, `"TimerNotExpired"`). `.args` is a typed decoding of the error arguments when available.
- `NetworkDetectionError` — `provider.getNetwork()` returned null or threw.

## 8. Network configuration

The SDK ships with default addresses for Base Mainnet, Base Sepolia, and a local Hardhat node. To use a custom deployment, pass `addresses` explicitly:

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

For a self-hosted or forked deployment, see [Deploying Your Own App](./deploying-own-app.md).

## 9. Read-only vs signed usage

For read-only (no transactions), instantiate without a signer:

```typescript
const maktub = new MaktubClient({ provider });
const info = await maktub.getHeartbeat(0n);
```

Any write method (create, checkIn, execute, update, deactivate, stake, etc.) called without a signer throws `SignerRequiredError`.

The client does not attempt to prompt for a signer. Applications should check at startup whether they have a signer and gate write-UIs accordingly.

## 10. Event subscriptions

Subscribe to on-chain events via the underlying `ethers.Contract`:

```typescript
maktub.core.contract.on(
  "HeartbeatCreated",
  (id: bigint, owner: string, recipients: string[], interval: bigint) => {
    console.log(`New heartbeat #${id} by ${owner}`);
  }
);

maktub.core.contract.on("HeartbeatExecuted", (id, executor, timestamp) => {
  console.log(`Heartbeat ${id} executed by ${executor} at ${timestamp}`);
});
```

For historical queries:

```typescript
const filter = maktub.core.contract.filters.HeartbeatCreated(null, ownerAddress);
const events = await maktub.core.contract.queryFilter(filter, -10_000);
```

Filter signatures follow standard ethers patterns. Refer to [Code Examples](./examples.md) for a complete executor-style event loop.

---

## Related reading

- [Contract Reference](./contracts.md)
- [Code Examples](./examples.md)
- [Integration Guide](./integration.md)
- [Deploying Your Own App](./deploying-own-app.md)

