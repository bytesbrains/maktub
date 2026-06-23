# Code Examples

Runnable TypeScript examples for the most common Maktub operations. Each example uses `@bytesbrains/maktub-sdk` v1 and `ethers` v6.

For the API reference, see [SDK Reference](./sdk.md). For the on-chain spec, see [Contract Reference](./contracts.md).

---

## Table of contents

1. [Setup](#setup)
2. [Register as a recipient](#register-as-a-recipient)
3. [Create a heartbeat](#create-a-heartbeat)
4. [Check in](#check-in)
5. [Read heartbeat status](#read-heartbeat-status)
6. [Update recipients or interval](#update-recipients-or-interval)
7. [Deactivate](#deactivate)
8. [Executor: stake, listen, execute, claim](#executor-stake-listen-execute-claim)
9. [Subscribe to events](#subscribe-to-events)
10. [Governance: propose, vote, execute](#governance-propose-vote-execute)
11. [Error handling patterns](#error-handling-patterns)

---

## Setup

```typescript
// common/client.ts
import { MaktubClient } from "@bytesbrains/maktub-sdk";
import { JsonRpcProvider, Wallet } from "ethers";

export function makeClient(privateKey: string, rpcUrl: string) {
  const provider = new JsonRpcProvider(rpcUrl);
  const signer = new Wallet(privateKey, provider);
  return new MaktubClient({ provider, signer });
}
```

For browsers, substitute `BrowserProvider(window.ethereum)` for `JsonRpcProvider`.

---

## Register as a recipient

Before your wallet can be named as a recipient on any heartbeat, it must be registered with an ECIES secp256k1 public key. (The contract argument is named `prePublicKey` for historical reasons but holds an ECIES key.)

```typescript
import { toUtf8Bytes } from "ethers";
import { makeClient } from "./common/client";

async function main() {
  const maktub = makeClient(process.env.PRIVATE_KEY!, process.env.RPC_URL!);

  // Obtain your ECIES secp256k1 public key from the SDK's crypto module.
  // For illustration we use a placeholder; in production this is the
  // public key of the keypair held on your device (33 or 65 bytes).
  const prePublicKey = "0x" + "00".repeat(33); // placeholder (field named prePublicKey for legacy reasons)

  const tx = await maktub.registerRecipient(prePublicKey);
  console.log("Registering:", tx.hash);
  const receipt = await tx.wait();
  console.log("Registered in block", receipt?.blockNumber);

  const address = await maktub.signer!.getAddress();
  const isRegistered = await maktub.isRecipientRegistered(address);
  console.log("Registered?", isRegistered);
}

main().catch(console.error);
```

---

## Create a heartbeat

```typescript
import { toUtf8Bytes } from "ethers";
import { makeClient } from "./common/client";

async function main() {
  const maktub = makeClient(process.env.PRIVATE_KEY!, process.env.RPC_URL!);

  // In a real app, encrypt your payload client-side and upload to IPFS.
  // The CID comes back; encode it as bytes for the payload field.
  const cid = "bafybeigdyrztvx7pj...";
  const payload = toUtf8Bytes(cid);

  const { tx, heartbeatId } = await maktub.createHeartbeat({
    recipients: [
      "0xAlice1234567890abcdef1234567890abcdef1234",
      "0xBob0987654321fedcba0987654321fedcba09876",
    ],
    payload,
    interval: 30 * 24 * 3600, // 30 days
  });

  console.log("Tx submitted:", tx.hash);
  await tx.wait();
  console.log("Heartbeat created with id:", heartbeatId.toString());
}

main().catch(console.error);
```

**Why this works:** the SDK reads `creationFee()` from the chain and attaches the correct `msg.value`. All recipients must be registered first; if any are not, the transaction reverts with `RecipientNotRegistered`.

---

## Check in

```typescript
import { makeClient } from "./common/client";

async function main() {
  const maktub = makeClient(process.env.PRIVATE_KEY!, process.env.RPC_URL!);
  const heartbeatId = 0n;

  const tx = await maktub.checkIn(heartbeatId);
  await tx.wait();

  const remaining = await maktub.timeRemaining(heartbeatId);
  console.log(`Timer reset. ${remaining} seconds until expiry.`);
}

main().catch(console.error);
```

---

## Read heartbeat status

```typescript
import { makeClient } from "./common/client";

async function main() {
  const maktub = makeClient(process.env.PRIVATE_KEY!, process.env.RPC_URL!);
  const id = 0n;

  const info = await maktub.getHeartbeat(id);
  const expired = await maktub.isExpired(id);
  const remaining = await maktub.timeRemaining(id);

  console.log({
    owner: info.owner,
    recipients: info.recipients,
    interval: info.interval.toString(),
    lastCheckIn: new Date(Number(info.lastCheckIn) * 1000).toISOString(),
    checkIns: info.checkInCount.toString(),
    executed: info.executed,
    deactivated: info.deactivated,
    expired,
    remainingSeconds: remaining.toString(),
  });
}

main().catch(console.error);
```

---

## Update recipients or interval

```typescript
import { makeClient } from "./common/client";

async function main() {
  const maktub = makeClient(process.env.PRIVATE_KEY!, process.env.RPC_URL!);
  const id = 0n;

  // Updating recipients resets the timer.
  const newRecipients = ["0xNewRecipient..."];
  const tx1 = await maktub.updateRecipients(id, newRecipients);
  await tx1.wait();
  console.log("Recipients updated; timer reset.");

  // Updating interval does NOT reset the timer.
  const tx2 = await maktub.updateInterval(id, 7n * 24n * 3600n); // 7 days
  await tx2.wait();
  console.log("Interval changed to 7 days.");
}

main().catch(console.error);
```

---

## Deactivate

```typescript
import { makeClient } from "./common/client";

async function main() {
  const maktub = makeClient(process.env.PRIVATE_KEY!, process.env.RPC_URL!);
  const id = 0n;

  const tx = await maktub.deactivate(id);
  await tx.wait();
  console.log("Deactivated. This is permanent.");
}

main().catch(console.error);
```

After this, `checkIn`, `updateRecipients`, `updateInterval`, and `execute` all revert with `HeartbeatIsDeactivated`.

---

## Executor: stake, listen, execute, claim

A minimal executor loop that stakes, listens for new heartbeats, and executes expired ones.

```typescript
import { MaktubClient } from "@bytesbrains/maktub-sdk";
import { JsonRpcProvider, Wallet, parseUnits } from "ethers";

const provider = new JsonRpcProvider(process.env.RPC_URL!);
const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
const maktub = new MaktubClient({ provider, signer });

interface Tracked {
  id: bigint;
  lastCheckIn: bigint;
  interval: bigint;
}

const tracked = new Map<string, Tracked>();

async function ensureStaked() {
  const emission = await maktub.getEmissionInfo();
  const address = await signer.getAddress();
  const info = await maktub.getExecutorInfo(address);

  if (!info.isActive) {
    console.log("Staking minimum MKTB...");
    const balance = await maktub.balanceOf(address);
    if (balance < emission.minimumStake) {
      throw new Error("Not enough MKTB to stake.");
    }

    const approveTx = await maktub.approve(
      (await maktub.init(), maktub.rewards.contract.target as string),
      emission.minimumStake
    );
    await approveTx.wait();

    const stakeTx = await maktub.stakeForExecution(emission.minimumStake);
    await stakeTx.wait();
    console.log("Active executor.");
  } else {
    console.log(`Already active. Stake: ${info.stakeAmount.toString()}`);
  }
}

async function scanHistorical() {
  await maktub.init();
  const core = maktub.core.contract;
  const latest = await provider.getBlockNumber();
  const from = Math.max(0, latest - 100_000);
  const events = await core.queryFilter(core.filters.HeartbeatCreated(), from, latest);
  for (const event of events) {
    // @ts-ignore ethers v6 event args typing
    const id = event.args[0] as bigint;
    const hb = await maktub.getHeartbeat(id);
    if (!hb.executed && !hb.deactivated) {
      tracked.set(id.toString(), {
        id,
        lastCheckIn: hb.lastCheckIn,
        interval: hb.interval,
      });
    }
  }
  console.log(`Tracking ${tracked.size} heartbeats.`);
}

function subscribeLive() {
  maktub.core.contract.on("HeartbeatCreated", async (id: bigint) => {
    const hb = await maktub.getHeartbeat(id);
    tracked.set(id.toString(), {
      id,
      lastCheckIn: hb.lastCheckIn,
      interval: hb.interval,
    });
  });

  maktub.core.contract.on("HeartbeatCheckedIn", (id: bigint, timestamp: bigint) => {
    const t = tracked.get(id.toString());
    if (t) t.lastCheckIn = timestamp;
  });

  maktub.core.contract.on("HeartbeatExecuted", (id: bigint) => {
    tracked.delete(id.toString());
  });

  maktub.core.contract.on("HeartbeatDeactivated", (id: bigint) => {
    tracked.delete(id.toString());
  });
}

async function tick() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  for (const t of tracked.values()) {
    if (now > t.lastCheckIn + t.interval) {
      try {
        console.log(`Executing heartbeat ${t.id}`);
        const tx = await maktub.execute(t.id);
        await tx.wait();
      } catch (err) {
        console.warn("Execute failed:", (err as Error).message);
      }
    }
  }
}

async function main() {
  await ensureStaked();
  await scanHistorical();
  subscribeLive();
  setInterval(tick, 60_000);
}

main().catch(console.error);
```

This is simplified from the production `executor/` package; for a full implementation with logging, reconnection, and reward handling, see `executor/src/`.

---

## Subscribe to events

```typescript
import { makeClient } from "./common/client";

async function main() {
  const maktub = makeClient(process.env.PRIVATE_KEY!, process.env.RPC_URL!);
  await maktub.init();

  maktub.core.contract.on(
    "HeartbeatCreated",
    (id: bigint, owner: string, recipients: string[], interval: bigint) => {
      console.log(`[created] #${id} owner=${owner} interval=${interval}`);
    }
  );

  maktub.core.contract.on(
    "HeartbeatExecuted",
    (id: bigint, executor: string, timestamp: bigint) => {
      console.log(`[executed] #${id} by ${executor} at ${timestamp}`);
    }
  );

  // Stay alive.
  await new Promise(() => {});
}

main().catch(console.error);
```

---

## Governance: propose, vote, execute

```typescript
import { AbiCoder, id, toUtf8Bytes } from "ethers";
import { VoteType } from "@bytesbrains/maktub-sdk";
import { makeClient } from "./common/client";

async function main() {
  const maktub = makeClient(process.env.PRIVATE_KEY!, process.env.RPC_URL!);

  // Step 1: delegate (required to have voting power, even delegating to self).
  const myAddress = await maktub.signer!.getAddress();
  const delegateTx = await maktub.delegateVotes(myAddress);
  await delegateTx.wait();

  // Step 2: create a proposal — e.g., change the executor minimumStake.
  const executorRewardsAddress = (await maktub.init(), maktub.rewards.contract.target as string);
  const calldata = new AbiCoder().encode(["uint256"], [500_000n * 10n ** 18n]);
  const functionSelector = id("setMinimumStake(uint256)").slice(0, 10);
  const fullCalldata = functionSelector + calldata.slice(2);

  const proposeTx = await maktub.propose(
    [executorRewardsAddress],
    [0n],
    [fullCalldata],
    "Raise executor minimumStake to 500,000 MKTB"
  );
  const receipt = await proposeTx.wait();
  // Extract proposalId from ProposalCreated event logs.
  // ... (omitted for brevity)

  // Step 3: after voting delay, cast a vote.
  // await maktub.castVote(proposalId, VoteType.For);

  // Step 4: after voting period + timelock delay, execute through the Governor.
  // await maktub.governance.execute(targets, values, calldatas, descriptionHash);
}

main().catch(console.error);
```

A complete governance workflow (including the timelock queue and execute steps) is longer than fits here. See `scripts/governance/` in the repo for a fully worked example.

---

## Error handling patterns

The SDK throws typed errors. Handle them explicitly.

```typescript
import {
  ContractRevertError,
  HeartbeatNotFoundError,
  SignerRequiredError,
} from "@bytesbrains/maktub-sdk";
import { makeClient } from "./common/client";

async function safeCheckIn(id: bigint) {
  const maktub = makeClient(process.env.PRIVATE_KEY!, process.env.RPC_URL!);
  try {
    const tx = await maktub.checkIn(id);
    await tx.wait();
    return { ok: true };
  } catch (err) {
    if (err instanceof HeartbeatNotFoundError) {
      return { ok: false, reason: "no_such_heartbeat" };
    }
    if (err instanceof ContractRevertError) {
      switch (err.code) {
        case "NotOwner":
          return { ok: false, reason: "wrong_wallet" };
        case "AlreadyExecuted":
          return { ok: false, reason: "already_executed" };
        case "HeartbeatIsDeactivated":
          return { ok: false, reason: "deactivated" };
        default:
          return { ok: false, reason: `revert:${err.code}` };
      }
    }
    if (err instanceof SignerRequiredError) {
      return { ok: false, reason: "no_signer" };
    }
    throw err; // unknown, rethrow
  }
}
```

Use this pattern at every UI boundary. User-facing apps must never show raw revert strings — translate them into human language.

---

## Related reading

- [SDK Reference](./sdk.md)
- [Integration Guide](./integration.md)
- [Contract Reference](./contracts.md)

