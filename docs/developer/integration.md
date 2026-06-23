# Integration Guide

How to build on top of Maktub Protocol — integrating heartbeat functionality into an existing application, building a domain-specific product on the primitive, or composing Maktub with other protocols.

This guide is practical. If you want the canonical spec, read [Protocol Specification](./protocol-spec.md) first.

---

## Table of contents

1. [When to integrate Maktub](#1-when-to-integrate-maktub)
2. [Integration patterns](#2-integration-patterns)
3. [Minimal integration: a check-in widget](#3-minimal-integration-a-check-in-widget)
4. [Domain apps: journalist protection, hiker safety, digital estate](#4-domain-apps)
5. [Pre-registration flows for your users](#5-pre-registration-flows-for-your-users)
6. [Payload conventions](#6-payload-conventions)
7. [Off-chain components you will need](#7-off-chain-components-you-will-need)
8. [Testing against Sepolia](#8-testing-against-sepolia)
9. [Production checklist](#9-production-checklist)

---

## 1. When to integrate Maktub

Good candidates for integration:

- **Products that already know a trusted recipient.** Dating apps with emergency contacts. Trip planners. Estate-planning services. You already have the "who should receive this" relationship; Maktub plugs in the "deliver if I go silent" mechanism.
- **Products where continuity is already a concern.** Enterprise knowledge bases with critical ownership. Password managers with inheritance features. Document-management systems.
- **Domain-specific applications where the general-purpose Maktub app does not fit.** A journalist-protection tool with newsroom-specific UX. A hiker app that integrates with trail maps. A custody service for high-net-worth clients.

Less-good candidates:

- Products whose use case is purely speculative trading or token launch. Maktub is not a liquidity tool.
- Products that need sub-second real-time guarantees. Maktub has 2-10 second execution latency.
- Products where content should be recallable. Delivery is permanent.

## 2. Integration patterns

Three common architectures.

**Pattern A — Maktub as a backend service.** Your app is the user interface; you call Maktub from your frontend via the SDK. Users have Maktub wallets, but your app hides the detail. Example: a password manager with an "inheritance" setting that creates a heartbeat behind the scenes.

**Pattern B — Maktub as a protocol building block.** Your app is a whole new application on top of the primitive. You build UI, onboarding, recipient management — everything — and share nothing with the reference app except the contracts. Example: a professional journalist-protection service with newsroom-specific features (multi-reporter access, legal review workflow, etc.).

**Pattern C — Maktub as a plugin.** A widget or library that existing apps can drop in to add heartbeat functionality. Uses Maktub wallets directly. Example: a React component any estate-planning service can embed.

Pattern A is the most common. Pattern B is the most ambitious. Pattern C is not well-supported yet (no drop-in SDK widget exists as of this writing) but is feasible with the current SDK.

## 3. Minimal integration: a check-in widget

The simplest useful integration: a "check-in now" button you can drop into any existing app.

```tsx
import { MaktubClient } from "@bytesbrains/maktub-sdk";
import { BrowserProvider } from "ethers";
import { useEffect, useState } from "react";

export function CheckInWidget({ heartbeatId }: { heartbeatId: bigint }) {
  const [timeLeft, setTimeLeft] = useState<bigint | null>(null);
  const [maktub, setMaktub] = useState<MaktubClient | null>(null);

  useEffect(() => {
    (async () => {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const client = new MaktubClient({ provider, signer });
      setMaktub(client);
    })();
  }, []);

  useEffect(() => {
    if (!maktub) return;
    const interval = setInterval(async () => {
      const remaining = await maktub.timeRemaining(heartbeatId);
      setTimeLeft(remaining);
    }, 10_000);
    return () => clearInterval(interval);
  }, [maktub, heartbeatId]);

  async function onCheckIn() {
    if (!maktub) return;
    const tx = await maktub.checkIn(heartbeatId);
    await tx.wait();
    const remaining = await maktub.timeRemaining(heartbeatId);
    setTimeLeft(remaining);
  }

  return (
    <div>
      {timeLeft !== null && <p>Time left: {formatSeconds(timeLeft)}</p>}
      <button onClick={onCheckIn}>I'm still here</button>
    </div>
  );
}
```

This widget assumes the user already has a heartbeat created (either via the Maktub app or via your flow). For a full creation flow, see the next section.

## 4. Domain apps

Three sketches of integration patterns tailored to specific use cases.

### 4.1 Journalist-protection app

A newsroom tool that layers newsroom-specific workflows on top of Maktub.

**Flow:**

1. A reporter creates an account (email-linked wallet via account abstraction).
2. At story onboarding, the newsroom editor (a second Maktub wallet owned by the editor) is automatically named as a recipient, along with the newsroom's legal counsel wallet.
3. The reporter uploads encrypted story material. Your app handles client-side encryption, pins to IPFS, and creates a 3-day-interval heartbeat.
4. The reporter checks in by opening the app and tapping. Your app can also integrate check-ins with existing editorial-system login (a login counts as a check-in; daily logins replace explicit check-in reminders).
5. At story publication, the app prompts to deactivate the heartbeat.

**What you build:** the editorial UI, the editor/legal custody wallets, the login-as-check-in integration. Maktub handles the primitive.

**Key design decisions:** editor and legal wallets should be hardware-backed. Reporter wallet policy is your choice — email is fine for most reporters; higher-risk reporters may want hardware wallets.

### 4.2 Hiker-safety app

A mobile app for solo hikers that creates safety-trigger heartbeats scoped to each trip.

**Flow:**

1. User signs up, registers one or more emergency contacts (who each register as Maktub recipients through a simplified invitation flow).
2. At trip start, the app collects trip metadata (route, vehicle, expected return, GPS start location) and creates a heartbeat. Interval is derived from the user's input.
3. The app automatically checks in when:
    - The user opens the app
    - GPS detects movement after a stationary period
    - The user presses a pre-set physical button (Apple Watch, etc.)
4. The app warns at 75% and 95% of the interval.
5. On trip end (user presses "I'm back"), the heartbeat is deactivated.

**What you build:** the trip UX, the GPS-based auto-check-in, the watch integration, the trip template library.

**Key design decisions:** auto-check-in policy. Auto-check-in means a phone that is still moving counts as "I'm alive" even if you're unconscious in a car accident. You may want to gate auto-check-in to specific signals (explicit tap, heart-rate confirmation) rather than movement alone.

### 4.3 Digital estate service

A service that helps high-net-worth clients create, maintain, and periodically refresh digital estate heartbeats.

**Flow:**

1. Client onboards via conventional KYC and subscription.
2. The service creates a hardware-wallet-backed Maktub identity for the client and for each named heir.
3. Heartbeats are created with 180- or 365-day intervals.
4. The service sends reminders, coordinates annual credential reviews, and provides professional support.
5. On the client's death, the service coordinates with heirs to ensure they know about the delivery and can actually operate their wallets.

**What you build:** the client-advisor relationship, the KYC, the annual review process, the heir-coaching workflow, the hardware-wallet logistics.

**Key design decisions:** hardware wallets for all parties. Clear succession planning for the service itself — what if the service goes away? The MIT-licensed protocol means clients can always migrate, but you should make that path explicit.

## 5. Pre-registration flows for your users

Your recipients must be registered in the Recipient Registry before they can be named. In an integrated app, you want this to be invisible.

**Best practice: registration on recipient invitation, not on heartbeat creation.**

- When your user invites a contact to be a recipient, send the invitee a link.
- The invitee follows the link, lands in your app, and goes through a simplified signup.
- Behind the scenes, your app creates a wallet for them (account abstraction) and submits `register(prePublicKey)` on the Recipient Registry.
- After registration, the invitee becomes selectable as a recipient in the inviter's UI.

**Fallback: pre-paid registration for the legacy case.**

If your user wants to name a recipient who has not yet registered, your app can reserve a slot and prompt the invitee to register before the heartbeat is sealed — `createHeartbeat` reverts if any named recipient is not yet registered, since the sender's device must wrap the content key to each recipient's registered ECIES public key at creation time. You can charge a small additional fee per unregistered recipient to cover their onboarding.

## 6. Payload conventions

The protocol treats `payload` as opaque bytes. Every application must decide what those bytes represent. For most integrations:

**Store an IPFS CID as bytes.** The CID points to the encrypted payload. The application encrypts on the client, uploads to IPFS, then writes the CID to the heartbeat.

Standard encoding:

```typescript
import { toUtf8Bytes } from "ethers";

const cid = "bafybeiabcdef...";         // IPFS CID v1
const payloadBytes = toUtf8Bytes(cid);  // bytes of the CID string
await maktub.createHeartbeat({ recipients, payload: payloadBytes, interval });
```

**Or a richer manifest.** If your app needs more than one pointer (e.g., a multi-chunk ciphertext, or a CID plus a key identifier), JSON-encode the manifest:

```typescript
const manifest = JSON.stringify({
  cid: "bafy...",
  algorithm: "threshold-pre-v2",
  keyId: "0xabc...",
});
const payloadBytes = toUtf8Bytes(manifest);
```

**Keep payloads small on-chain.** Each byte costs gas to store. A 100-byte CID+manifest is negligible; a 1 KB JSON blob costs roughly 10x more gas. If your payload needs to be larger, use the manifest+IPFS pattern.

## 7. Off-chain components you will need

A production integration is more than just contract calls.

- **Client-side encryption.** Encryption happens on the sender's device. The `@bytesbrains/maktub-sdk` ships the ECIES-on-secp256k1 crypto (per-recipient hybrid envelope) so you do not need an external encryption network. For the optional Veil time-lock, the SDK uses `warden_ffi`/WASM to wrap the envelope in a Veil gate (preview). Generate and store each user's ECIES keypair on-device.
- **IPFS uploads.** Pinata, Filebase, Web3.Storage, or your own IPFS node. Pin redundantly for availability.
- **Arweave uploads (optional, for high-stakes payloads).** For payloads you want indefinitely preserved.
- **Notifications.** Your app should notify users when check-ins are coming due. This is entirely off-chain and is the single most important UX element for keeping heartbeats alive.
- **Recipient notifications.** When a heartbeat fires, recipients need to know. Push, email, SMS — any channel your users already use.
- **Event indexing.** For listing a user's heartbeats, historical queries, or executor-style monitoring, you likely want The Graph or a custom indexer rather than hammering the RPC directly.

## 8. Testing against Sepolia

Maktub is deployed on Base Sepolia at the addresses listed in [Contract Reference](./contracts.md#deployed-addresses).

- Get Base Sepolia ETH from a faucet (Coinbase Developer Platform, Alchemy, etc.).
- Get test MKTB: the token is mintable on Sepolia; request from the deployment team or (if you're running your own deployment) mint to your own test wallet.
- Set `chainId: 84532` in your SDK configuration.
- Run the executor node locally to observe your own heartbeats firing end-to-end.

Your own integration tests should cover:

- Happy path: create, check in, query, deactivate
- Recipient registration before first use
- Expiry and execution (using a 1-hour interval, which is the protocol minimum)
- Gas estimation for all operations
- Event subscription and offline recovery
- Revert-path handling for all 13 possible MaktubCore errors

## 9. Production checklist

Before going live:

- [ ] Contract addresses for the target network are correct and pinned
- [ ] The encryption library version is pinned and audited (no ambient updates)
- [ ] IPFS pinning is redundant (at least two providers)
- [ ] Notifications are tested on all delivery channels
- [ ] Recipient onboarding is tested for new, non-crypto users
- [ ] Lost-wallet recovery flow is documented for your users (even if it is "there is none")
- [ ] Fee-source wallet is funded (if your app pays gas on behalf of users)
- [ ] Emergency response plan: what happens if Base has an outage? If your storage providers degrade? If the Veil time-lock federation degrades (preview-only; base ECIES decryption is unaffected)? If your own service goes down?
- [ ] Legal review: terms of service, privacy policy, jurisdiction, data export
- [ ] Audit: an independent review of your integration, not just the underlying protocol
- [ ] Monitoring: you can tell when users' heartbeats expire and when executions fail
- [ ] Runbook: your on-call engineers know what to do when a user reports a problem

---

## Related reading

- [Deploying Your Own App](./deploying-own-app.md)
- [Code Examples](./examples.md)
- [SDK Reference](./sdk.md)
- [Contract Reference](./contracts.md)

