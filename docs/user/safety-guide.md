# Safety Guide

This guide addresses the questions that start with "what if...?" What if I lose my wallet? What if my recipient loses theirs? What if the network goes down? What if I want to stop a heartbeat in an emergency?

Read this once before you create a heartbeat, and keep it for reference.

---

## Table of contents

1. [Principles](#principles)
2. [If you lose access to your wallet](#if-you-lose-access-to-your-wallet)
3. [If a recipient loses access to theirs](#if-a-recipient-loses-access-to-theirs)
4. [If your recipient has no wallet yet](#if-your-recipient-has-no-wallet-yet)
5. [If you want to stop a heartbeat in an emergency](#if-you-want-to-stop-a-heartbeat-in-an-emergency)
6. [If Base L2 has an outage](#if-base-l2-has-an-outage)
7. [If the Veil time-lock federation has an outage](#if-the-veil-time-lock-federation-has-an-outage)
8. [If IPFS or Arweave fails](#if-ipfs-or-arweave-fails)
9. [If the reference app is unavailable](#if-the-reference-app-is-unavailable)
10. [If you accidentally send to the wrong person](#if-you-accidentally-send-to-the-wrong-person)
11. [If you forget your check-in and the timer is close](#if-you-forget-your-check-in-and-the-timer-is-close)
12. [Long-term maintenance checklist](#long-term-maintenance-checklist)

---

## Principles

Three ideas to hold on to while reading the rest of this page.

**The protocol cannot distinguish your silence from your death.** If you stop checking in for any reason, the timer will expire. This is not a bug — it is the entire point. The protocol's whole value comes from the fact that it makes no exceptions, not even for you, not even on your behalf.

**The core contracts have no emergency override.** There is no "Maktub support" who can cancel your heartbeat for you, halt delivery, or reach in on your behalf. The only actor who can control your heartbeat is the wallet that signed it. Hold that wallet well.

**Redundancy lives in how you configure things, not in a retry mechanism.** If you want to be resilient against losing your phone, back up your wallet. If you want to be resilient against a recipient losing theirs, name a backup recipient. The protocol's job is to deliver; your job is to choose settings and setups that give you the safety margin you want.

---

## If you lose access to your wallet

**If you have your recovery phrase or a recovery login:** use it. Restore wallet access on a new device, open the Maktub app, and check in normally. Consider this incident a prompt to review your backups.

**If you have lost both your wallet and your recovery path:** you cannot check in. Your heartbeat will expire after one interval and deliver to your recipients. If you consider this acceptable — the delivery is what you wanted to happen when you created the heartbeat, just earlier than expected — do nothing. If you consider it unacceptable because you are still alive and the delivery would reveal secrets inappropriately, there is no protocol-level remedy. The practical steps you can take:

- Create a new wallet. Create a new heartbeat with appropriate updates. The new heartbeat does not affect the old one; the old one will still deliver on its schedule.
- If the payload in the old heartbeat contains passwords or seed phrases, rotate them before the old heartbeat fires. After delivery, your recipients will see what *was* true at the time you last updated the payload — which can now be out-of-date information pointing at nothing.
- Contact your recipients. Tell them what happened. When they eventually receive the delivery, they will not be surprised.

**How to avoid losing the wallet in the first place:**

- If you use an email-linked wallet, ensure your email account itself has strong authentication and recovery. Losing the email means losing the wallet.
- If you use a seed-phrase wallet, write the seed phrase on paper or a metal backup, and keep it somewhere only you (and perhaps one trusted person) can reach.
- If you use a hardware wallet, have a second hardware wallet initialized with the same seed phrase stored somewhere separately.
- Consider a multisig for high-stakes accounts. A 2-of-3 multisig can survive losing one signing device.

## If a recipient loses access to theirs

**If the heartbeat has not yet executed:** update the recipient list to add a new address for them. They will need to register the new address in the Recipient Registry (free, 2 minutes). Remove the old address from the list. Updating recipients resets the timer — you get a full new interval before execution becomes possible.

**If the heartbeat has already executed:** the delivery is locked to the original recipient address. There is no way to reroute it. If the payload is high-stakes (seed phrases, critical passwords), the content is effectively lost to them. You should rotate the relevant credentials immediately.

**Preventive measures:**

- Name a backup recipient in addition to your primary recipient. Two recipients means the delivery reaches at least one of them even if the other loses access.
- Encourage your recipients to back up their own wallets. Their security hygiene protects your delivery.
- For estate-planning heartbeats, review recipients annually and confirm that each is still wallet-capable.

## If your recipient has no wallet yet

The protocol requires every recipient to be registered in the Recipient Registry before a heartbeat can name them. Options:

**Ask them to register first.** The registration flow is: open the app, sign in with email or connect a wallet, register as a recipient. Total time: under five minutes. Registration is free (just network gas).

**Use prepaid registration.** When creating the heartbeat, you pay a small additional fee per unregistered recipient. This reserves the slot for them. The recipient then completes registration later; when they do, they are able to claim the payload. The heartbeat can fire and deliver before the recipient registers — the ciphertext waits on storage until they complete the flow.

**Pre-pay gas for their claim.** Some recipients will never have held crypto and will not have ETH on Base. When creating the heartbeat, you can include a small gas deposit that covers the recipient's claim transaction. This is handled automatically in the app.

## If you want to stop a heartbeat in an emergency

Call `deactivate(heartbeatId)`. This is a one-transaction action from the owner's wallet. A deactivated heartbeat cannot fire, cannot be modified, and cannot be reactivated.

Scenarios where you might want to deactivate:

- **You published the story.** For a press-freedom heartbeat, once the story is out, the heartbeat is no longer useful. Deactivate and close the loop.
- **You returned from the trip.** For a safety heartbeat, once you are safely home, deactivate if you do not plan to reuse the same heartbeat. Many users prefer to keep a reusable heartbeat and simply update the payload and interval next trip.
- **Circumstances changed.** You decided you do not want this delivery to happen. Deactivate and either create a new heartbeat with different recipients or leave the future unconfigured.
- **You were about to miss a check-in and the timer is close, but you no longer want the delivery to happen.** Deactivate before expiry.

Deactivation is permanent by design. We do not want a world where a heartbeat can be "paused" or "unpaused" because that opens the door to the wrong kind of pressure — someone compelling you to pause, waiting for you to forget, and then letting it fire. Deactivation is terminal, and the only way back is to write a new heartbeat.

## If Base L2 has an outage

Base L2 is operated by Coinbase on the OP Stack. Historically it has had high uptime. In the rare event of a Base sequencer outage, there are two scenarios.

**Short outage (minutes).** Check-in transactions queue in the mempool and execute when the sequencer resumes. Provided your interval has some slack, your check-in goes through before your timer would have expired.

**Longer outage (hours).** Same mechanism, but risk of accidental expiry grows. Optimistic rollups provide an L1 fallback: users can submit check-in transactions directly to Ethereum mainnet, bypassing the sequencer. This path is more expensive (higher L1 gas, depending on congestion) but works. The reference app has a "submit via L1 fallback" option for use in extended outages.

**Practical guidance:**

- For high-stakes safety triggers, do not use the absolute minimum 1-hour interval. Give yourself enough margin that a 1-hour network hiccup does not fire your heartbeat.
- If an outage coincides with an urgent need to check in, use the L1 fallback.

## If the Veil time-lock federation has an outage

**This only affects letters you sent with the optional Veil time-lock turned on.** A normal letter is encrypted to each recipient on your device at creation time and depends on no outside network to read — so a federation outage cannot delay it.

For a **Veil** letter, the in-house Warden federation releases the time-lock gate when the heartbeat executes on-chain. If the federation is unavailable at the moment of execution:

- The on-chain execution event still fires.
- The payload ciphertext is still available (inline on-chain, or on IPFS for oversize media).
- Releasing the time-lock gate is deferred until the federation recovers. When it does, recipients can claim normally.

This is a delay, not a failure. But note: **Veil is a preview today** — on the current test network the federation is operator-run, so its timing is not yet a guarantee. Confidentiality (only your named recipients can read the letter) holds regardless.

## If IPFS or Arweave fails

Payloads are stored on IPFS (content-addressed, pinned by many nodes) and on Arweave (paid permanent storage). Both are decentralized and independent.

**If IPFS has trouble reaching a specific ciphertext:** try again; IPFS often resolves routing issues within minutes. The ciphertext is addressed by hash and can be served by any node that has a copy.

**If Arweave has a service issue:** IPFS is still serving. Vice versa.

**If both fail simultaneously:** the delivery event is still recorded on-chain, but the ciphertext cannot be fetched. This is an extreme and unlikely scenario. The team and the broader community pin payloads redundantly; additional research into further redundancy is ongoing.

For very high-stakes payloads, consider storing a second copy privately (e.g., on your own encrypted backup) that the recipient can be pointed at if the public storage layer has issues. This is a defense-in-depth pattern, not a protocol requirement.

## If the reference app is unavailable

The reference web app at maktub.it is a convenience, not a requirement. If it is down or discontinued:

- The mobile app can read and write to the same contracts.
- Any third-party app built with the SDK can do the same.
- You can interact with the contracts directly using a block explorer's "write contract" interface (look up the MaktubCore address on Basescan) or using any ethers/web3 tool.
- You can host your own copy of the reference app, because it is open source.

The [Deploying Your Own App](../developer/deploying-own-app.md) guide walks through self-hosting. The [Contract Reference](../developer/contracts.md) lists every function you might need to call directly.

## If you accidentally send to the wrong person

**Before the heartbeat fires:** update the recipient list. The wrong address is removed and does not deliver.

**After the heartbeat fires:** the delivery to that address cannot be recalled. The protocol has no undo. Practical response:

- If the payload contained credentials, rotate those credentials immediately.
- If the recipient is someone who will behave professionally (wrong address was another person you trust), reach out and explain.
- If the recipient is unknown, assume the payload is compromised.

To avoid this mistake:

- Double-check addresses at creation time. The app shows the recipient's registered contact info (if any) as a sanity check.
- Use the address book feature to save known contacts with human-readable names.
- Use the "confirm intended recipient" step that the app shows before submitting creation.

## If you forget your check-in and the timer is close

A heartbeat is considered expired the moment `block.timestamp > lastCheckIn + interval`. If your timer is one hour from expiring and you realize you have been busy and forgot:

**Check in now.** Do it from any device with your wallet. The check-in resets the timer.

**If you have no internet right now:** find internet soon. A typical mobile hotspot, coffee shop, or hotel lobby will get you on-chain in minutes.

**If you genuinely cannot get on-chain in time:** the heartbeat will expire. Executors will pick it up within seconds. If the payload is something you would rather not have delivered, consider that a lesson for next time: choose a longer interval if your life does not allow daily check-ins.

The app sends warning notifications at 75% and 95% of the interval. If you see one, treat it as a prompt, not a suggestion.

## Long-term maintenance checklist

For heartbeats you plan to keep for years, run this checklist annually.

- [ ] Recipients are still reachable and still the right people
- [ ] Recipients still have working wallets (ask them: "Can you open your Maktub app?")
- [ ] The payload is current — no obsolete passwords or defunct accounts
- [ ] The interval still makes sense for your life today
- [ ] Your wallet is still backed up
- [ ] You can find your recovery phrase or recovery login if you need to
- [ ] The Maktub mobile app is installed on your current phone
- [ ] You have enough ETH on Base to cover a year's worth of gas (typically pennies)
- [ ] You know how to deactivate if you ever need to

An annual 15-minute review keeps a long-running heartbeat healthy.

---

## Related reading

- [Getting Started](./getting-started.md)
- [FAQ](./faq.md)
- [Digital Estate](./digital-estate.md), [Safety Triggers](./safety-triggers.md), [Press Freedom](./press-freedom.md) — use-case-specific guidance
- [How It Works](./how-it-works.md)

