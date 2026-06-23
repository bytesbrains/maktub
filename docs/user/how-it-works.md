# How It Works

A plain-language explanation of what actually happens inside the Maktub Protocol. No cryptography background required. If you want the technical specification, see [Protocol Specification](../developer/protocol-spec.md).

---

## The whole system in one paragraph

You write a message and your device encrypts it — once for each person you name, using the public key they registered on-chain. The encrypted letter is small enough to live **directly inside** a smart-contract record on Base L2 (oversize media can be stored by reference instead). That record holds three things: who can receive the letter, the encrypted letter itself, and a timer. You then check in periodically — each check-in is a tiny transaction that resets the timer. If you stop checking in, any independent "executor" node watching the chain triggers a delivery function on the contract; and if no executor does, after a short grace window **anyone — including a recipient — can trigger it**, so delivery never depends on any single party. Each recipient then decrypts the letter on their own device with their own private key. Once that happens, the message is permanent: you cannot recall it and no one can stop it.

That's the whole system. An optional **time-lock** (called Veil) can keep even the recipient from reading until the timer fires — it's a **preview** feature today, explained below. The rest of this document walks through each part.

---

## Table of contents

1. [Three parties, four layers](#three-parties-four-layers)
2. [Creating a heartbeat step by step](#creating-a-heartbeat-step-by-step)
3. [Checking in](#checking-in)
4. [Execution: what happens when the timer runs out](#execution-what-happens-when-the-timer-runs-out)
5. [How recipients receive the message](#how-recipients-receive-the-message)
6. [How the encryption works](#how-the-encryption-works)
7. [What the protocol can and cannot see](#what-the-protocol-can-and-cannot-see)
8. [Who runs the infrastructure](#who-runs-the-infrastructure)
9. [What "immutable" means here](#what-immutable-means-here)
10. [Cost breakdown](#cost-breakdown)

---

## Three parties, four layers

There are three parties in the protocol:

- **The owner.** The person who creates the heartbeat, writes the payload, and checks in.
- **The recipients.** The people or organizations the owner named. They receive the payload if the owner goes silent.
- **The executors.** Independent node operators who watch the chain and trigger delivery when a timer expires. They are rewarded in MKTB tokens, not user fees. They are not required for delivery to *eventually* happen — see the backstop in [Execution](#execution-what-happens-when-the-timer-runs-out).

And the layers involved:

- **Application layer.** The app you use: the web app at maktub.it, the mobile app, or any third-party application built on the protocol. **This is where encryption happens, on your device, before anything leaves it.**
- **Protocol layer.** The smart contracts on Base L2. This is the part that is immutable and trustless. It stores the heartbeat — recipients, the encrypted letter (inline), and the timer — and enforces the rules.
- **Storage layer (only for oversize media).** A letter within the on-chain size cap needs no external storage at all; it lives inside the contract record. For payloads too large for that cap, the protocol accepts a content-addressed pointer (e.g. IPFS / Arweave) instead. Durable permanent storage for the pointer model is a mainnet prerequisite still being finalized.
- **Time-lock layer (optional, preview).** For Veil letters, an independent "Warden" federation withholds a decryption gate until the on-chain delivery condition is met. On the current test network this federation is run by us, which is why the time-lock is a preview and not yet a guarantee.

The key architectural decision is that the protocol layer is minimal. It only knows about timers, addresses, and an opaque encrypted payload. Encryption and identity live in layers the protocol cannot read.

## Creating a heartbeat step by step

When you tap "Create" in the app, here is what happens behind the scenes, in order:

1. **The app encrypts your payload on your device.** It builds one encrypted envelope and wraps the key once for *each* recipient, using the public key each recipient registered on-chain. From this point on the payload is opaque ciphertext that only a named recipient's private key can open. (If you turned on the **time-lock**, the app additionally wraps the envelope in a Veil gate — preview; see [How the encryption works](#how-the-encryption-works).)
2. **The encrypted letter rides inline — no upload.** As long as it fits the on-chain size cap (`MAX_PAYLOAD_BYTES = 4096` bytes), the ciphertext is carried *inside* the create transaction and stored in the contract's own state. Only oversize media falls back to a content-addressed pointer.
3. **The app calls `createHeartbeat` on the MaktubCore contract.** This transaction includes:
   - The list of recipient addresses you named (1 to `MAX_RECIPIENTS = 25`)
   - The encrypted payload itself (inline), or a pointer for oversize media
   - The interval you chose, in seconds (1 hour to 365 days)
   - The protocol fee, in ETH (see [Cost breakdown](#cost-breakdown))
4. **The contract validates the transaction.** It checks:
   - Is the fee at least `creationFeeFor(recipientCount)`? If not, revert.
   - Is the interval between 1 hour and 365 days? If not, revert.
   - Are all recipients registered in the RecipientRegistry? If any are not, revert with that recipient's address.
   - Is the recipient list non-empty and within the 25-recipient cap? If not, revert.
   - Is the payload non-empty and within 4096 bytes? If not, revert.
5. **The contract stores the heartbeat.** Its ID is content-addressed — derived deterministically from your address plus a random salt you supply (`id = keccak256(owner, salt)`), so the app knows the ID before the transaction even lands. The contract records the data, sets `lastCheckIn` to the current block timestamp, and emits a `HeartbeatCreated` event.
6. **The app shows you the success screen** with the new heartbeat.

From your perspective this takes a few seconds: encryption on-device, then a single on-chain transaction.

## Checking in

A check-in is the simplest operation in the protocol. It does exactly one thing: reset the timer.

1. You open the app.
2. The app calls `checkIn(heartbeatId)` on the contract.
3. The contract verifies you are the owner and that the heartbeat is active (not executed, not deactivated).
4. The contract sets `lastCheckIn = block.timestamp` and emits a `HeartbeatCheckedIn` event.

That's it. **There is no protocol fee** for checking in. The only cost is network gas, paid in ETH, which is negligible on Base.

You can check in as often as you want. Each check-in resets the timer to a full interval. Checking in on day 2 of a 30-day timer gives you 30 more days; checking in on day 29 also gives you 30 more days.

## Execution: what happens when the timer runs out

Suppose your interval was 30 days and your last check-in was on May 1 at noon UTC. At 12:00:01 UTC on May 31, the heartbeat becomes eligible for execution.

At that moment, no one has *done* anything. The contract does not send a notification, and time alone does not trigger delivery. What happens next is a race between independent executors watching the chain.

1. **An executor node notices.** Executors run software that subscribes to new blocks on Base and tracks active heartbeats and their expiry times. When the expiry passes, the executor prepares to execute.
2. **The executor submits `execute(heartbeatId)`.** This is an on-chain transaction; the executor pays the gas (in ETH, negligible on Base).
3. **The contract validates.** It checks:
   - Has the timer actually expired? If not, revert.
   - **Who may call it:** for the first 2 days after expiry (`EXECUTION_GRACE`), only an actively staked executor may execute — the rewarded fast path. **After that grace window, execution becomes permissionless:** anyone, notably a recipient, may call `execute` themselves (unrewarded). This backstop means delivery liveness never depends on the executor market or anyone's permission.
4. **The contract marks the heartbeat as executed.** This is a one-shot, irreversible state change. From now on, any further `checkIn` or `execute` calls revert.
5. **The contract emits a `HeartbeatExecuted` event.** This event is the public, verifiable signal that delivery has begun.
6. **Recipients can now read.** For a normal letter, each recipient already holds the key-wrap addressed to them, so they can decrypt as soon as their app reads the payload. For a **Veil (time-locked) letter**, the Warden federation watches for this exact execution condition and only then releases the decryption gate — so until execution, even the recipient cannot read it (preview; see the honesty note below).
7. **Rewards (staked executors only).** An executor that took the fast path earns MKTB through the reward relay; the permissionless backstop path earns nothing. Reward eligibility is gated (the heartbeat must be old enough and have a real check-in) so no one can farm rewards with a throwaway heartbeat.

Multiple executors may try to execute the same heartbeat at nearly the same moment. Only the first transaction to be mined wins; the others revert cheaply with `AlreadyExecuted`. Competition keeps latency low — typically a few seconds from expiry to execution.

## How recipients receive the message

Once the heartbeat is executed:

1. **The recipient's app surfaces the delivered letter.** Delivery notices are **on-device and local only** — there is no Maktub push server, no notification registry, and no email list. The recipient learns about a delivery when they open the app (the app reconciles state from the chain) or from a local notification their own device raised. Maktub never holds a directory of who to notify.
2. **The recipient views the delivered item.** It shows the sender's name (if known to them through their contacts), the date the timer expired, and a way to open it.
3. **The recipient decrypts locally with their private key.** Their key never leaves their device. For a Veil letter, decryption waits on the federation releasing the time-lock gate — but this timing is a **preview** and not yet secured on the test network (see the honesty note in [How the encryption works](#how-the-encryption-works)).
4. **The plaintext appears.** They see the message. It remains available to claim from then on; the owner cannot recall it.

## How the encryption works

This is the part that lets the protocol deliver a confidential message without the protocol — or Maktub — ever holding a key.

**Maktub v1 uses ECIES on the secp256k1 curve, in-app.** Plainly: your device does the cryptography itself. There is **no external re-encryption network, no threshold service, nothing to subpoena, pay, or shut down.** When you create a letter:

- You encrypt the content **once** into a compact "hybrid" envelope, and the app wraps that envelope's key separately for **each** recipient, using the public key they registered on-chain. (This is why adding a recipient costs a little more — one more key-wrap.)
- Only the matching **private key** — which never leaves a recipient's device — can unwrap their copy and read the letter.

It helps to separate two different properties, because Maktub keeps one of them today and is still proving the other:

- **Confidentiality — *only the named recipient can read it*.** This is shipped and real. The content is end-to-end encrypted to each recipient's key.
- **Time-confidentiality — *no one, not even the recipient, can read it until the timer fires*.** This is the optional **Veil** time-lock, and it is a **PREVIEW**. Veil layers a Warden threshold-gate (released by the on-chain `HeartbeatExecuted` condition) over the same hybrid envelope. On the current test network the release federation is run by us, so the *timing* is **not yet secured** — a determined recipient could in principle read a plain letter's on-chain ciphertext before the trigger. **Do not rely on the time-lock as a guarantee yet.** Recipient confidentiality, however, is real with or without Veil.

A note on changing a letter: **recipients and content are sealed when you create it.** You cannot edit them in place — re-pointing the recipient list on-chain would not re-encrypt the sealed payload, so an added recipient could never decrypt and a removed one might still hold a readable copy. To change who receives a letter, or what it says, you pause it and create a new one.

> **Why not a Proxy Re-Encryption network?** Earlier designs imagined delivery via a Proxy-Re-Encryption / threshold network (e.g. NuCypher/Threshold). For v1 we deliberately chose in-app ECIES instead: it adds no runtime dependency on a third-party network's liveness, pricing, or geography, and there is nothing for an adversary to censor. Conditional-decryption networks remain a possible future direction (and Veil is the first step toward true unreadable-until-trigger delivery), but they are roadmap, not the shipped v1 mechanism.

## What the protocol can and cannot see

The protocol layer — the smart contracts on Base — **sees**:

- Your wallet address as owner
- Your recipients' wallet addresses
- The encrypted letter itself (inline ciphertext), or a pointer to it
- The interval
- The timestamps (creation, each check-in, execution)

It **cannot see**:

- The plaintext of your message (encrypted on-device before it is ever sent)
- Any private key (only the recipients hold those, on their own devices)

This is why Maktub can say, truthfully, that it is **content-agnostic**: the team that built it cannot read any payload, the executors cannot read any payload, and a subpoena for a specific user's data yields a wallet address, a timer, and ciphertext — never the words.

**But be clear about the limit.** Everything in the "sees" list above is **public and permanent** on-chain. Anyone analyzing Base can see that an address created a silence-triggered letter, which addresses it names, when it was last checked in, and when it was delivered. Maktub protects **what your letter says** (content), not **the fact that you wrote one or whom it names** (metadata).

> *"For whom it is written"* means who can **read** it — never who can **see that it exists**. Encryption is strong; metadata is public. Maktub does not claim invisibility or anonymity.

This is not a legal claim. It is a structural property of how the system is built.

## Who runs the infrastructure

For the protocol to work, a few things have to be running — none of which is "Maktub the company" in the sense of a service you pay and that can be switched off.

- **Ethereum and Base L2.** Base is built on the OP Stack and settles to Ethereum. Ethereum has run without downtime since 2020.
- **The executor network.** Anyone can run an executor; the reference software is open source (MIT) and runs on a cheap VPS. Executors are incentivized by MKTB emissions. And because execution becomes **permissionless** two days after expiry, even a total collapse of the executor market cannot strand a delivery — a recipient can execute it themselves.
- **Content storage (only for oversize media).** Letters within the on-chain size cap need no external storage. For larger media stored by reference, content-addressed networks (IPFS / Arweave) hold the bytes; durable permanent pinning is a mainnet prerequisite still being finalized.
- **The Warden / Veil federation (preview).** For the optional time-lock, a federation withholds the decryption gate until the execution condition is met. Today it runs on the test network under our control — which is exactly why Veil is a preview — and is designed to become an independent federation before any security claim is made about timing.

Maktub the team maintains the reference applications (web and mobile) and contributes to the SDK. The reference app is convenient but not required — anyone can build another frontend against the same contracts.

## What "immutable" means here

**MaktubCore, RecipientRegistry, and MktbToken are immutable smart contracts.** There is no admin key, no pause function, no upgrade proxy, and no migration. The code that is deployed is the code that runs, forever.

This means:

- **No one can freeze your heartbeat.** Not Maktub, not governance, not a court — not at the protocol layer. (A court can order a *person* to deactivate a heartbeat; the protocol honors a deactivation only because the owner signed it.)
- **No one can drain the fees.** The fee receiver is set at deploy time and hardcoded. It can only receive ETH; it has zero control over the contract.
- **No one can change the fee.** Fees were set at deploy time. Changing them would require deploying a new contract; existing heartbeats on the old contract are unaffected.
- **No one can change the protocol's rules.** The 1-hour minimum, 365-day maximum, 25-recipient cap, 4096-byte payload cap, and the rest are burned into the deployed bytecode.

The one **separable** piece is **ExecutorRewards** — the economic layer that handles executor staking and the MKTB reward schedule. It is tunable, but since the permissionless-execution backstop it has **zero control over whether a delivery happens**. No governance path reaches the core contracts; there is no admin function for one to call, because the core has none.

When a bug or improvement warrants it, the fix ships as a **new immutable deployment** (a V2) with opt-in migration — the old contracts keep running forever. The protocol never grants itself the power to change in place.

This is the main structural commitment Maktub makes: **users trust math, not governance.**

## Cost breakdown

All protocol amounts are denominated in ETH/wei — Maktub has no fiat peg and no fiat fees.

For the **owner**, a single heartbeat over one year:

| Item | Cost |
|---|---|
| Create heartbeat (one-time) | `baseFee` = 124,000,000,000,000 wei (≈ 0.000124 ETH) for one recipient; **+** `perAdditionalFee` = 40,000,000,000,000 wei (≈ 0.00004 ETH) per recipient beyond the first |
| Network gas for creation | paid in ETH; negligible on Base |
| Check-ins over a year | gas only — **no protocol fee** |
| Recipient registration, if a recipient is new | one-time on-chain step (gas only; the owner can prepay it for them) |

For the **recipient**:

| Item | Cost |
|---|---|
| Registration (one-time, ever) | gas only (may be prepaid by the owner) |
| Reading a delivered letter | decryption is local and free; any on-chain read is negligible gas |

For the **executor**:

| Item | Cost |
|---|---|
| Minimum MKTB stake (returnable) | a governance-set minimum on the reward layer |
| Infrastructure (VPS + RPC) | the ordinary cost of a small always-on node |
| Gas per execution | paid in ETH; negligible on Base |
| Earning per execution | MKTB emission, governance-tuned (fast-path executors only) |

The creation fee is set deliberately low; per-recipient pricing exists as economic discipline against broadcast abuse, not as a revenue lever.

---

## Related reading

- [Getting Started](./getting-started.md)
- [FAQ](./faq.md) — common questions
- [Safety Guide](./safety-guide.md) — what to do when something goes sideways
- [Protocol Specification](../developer/protocol-spec.md) — the technical version of this document
- [Contract Reference](../developer/contracts.md) — every function, event, and error

