# Frequently Asked Questions

Answers to the questions people most often ask about Maktub. If your question is not here, try the [Safety Guide](./safety-guide.md), the [Glossary](./glossary.md), or [How It Works](./how-it-works.md).

---

## The basics

### What is Maktub?

Maktub is a small, focused piece of software that delivers a message you wrote to people you named, if you stop checking in for a time you chose. It is built on public infrastructure (Base L2, Ethereum, and — only for oversize media — IPFS/Arweave) and runs as long as those do. Your message is encrypted on your own device before it is ever sent. Creating a heartbeat costs a small one-time fee, paid in ETH on Base. Checking in is free.

### Why is it called Maktub?

*Maktub* is Arabic for "it is written." We chose the name because the protocol does one thing that matches the word: it seals what you write, and guarantees it will arrive. It is the same word Paulo Coelho uses in *The Alchemist* to describe what is meant to reach you reaching you.

### Is this a crypto product?

Maktub uses crypto infrastructure the way email uses SMTP — because it is the cheapest, most reliable way to do the job. But it is not a "crypto product" in the speculative sense. There is no promise of returns. There is no airdrop. The MKTB token exists only to pay executors and to let the community govern the protocol. The protocol's purpose is delivering messages, not trading.

### Do I need to know anything about crypto to use it?

No. The app handles wallet creation, funding, and transactions. You will encounter a few terms you might be new to — wallet, gas, network — but the main flow is: write a message, name recipients, set a timer, check in occasionally. The [Glossary](./glossary.md) defines anything unfamiliar.

### What does it cost?

Creating a heartbeat costs a small one-time fee, paid in ETH on Base. Check-ins are free (you pay a negligible amount of network gas, depending on network conditions). Recipients pay nothing to receive. See [How It Works](./how-it-works.md) for a detailed cost breakdown.

---

## Using it

### How long can a timer be?

Between 1 hour and 365 days. You can change the interval at any time (without resetting the timer), but you cannot go outside those bounds.

### How often do I have to check in?

At least once per interval. For a 30-day heartbeat, you must check in within 30 days of your last check-in. You can check in more often — every check-in resets the timer to a full interval.

### Can I have more than one heartbeat?

Yes, as many as you like. Many users have one long-interval estate heartbeat and one short-interval safety heartbeat for active trips. Each is independent with its own recipients, payload, and timer.

### Can I change the message later?

Yes. You can update the payload, the recipient list, and the interval at any time while the heartbeat is active. Updating recipients resets the timer as a safety measure. Updating the payload alone does not. Updating interval does not.

### Can I cancel a heartbeat?

Yes, by calling `deactivate`. This is permanent — you cannot reactivate a deactivated heartbeat. Create a new one if you want the safeguard back.

### Can my recipient see my message before the timer expires?

It depends on whether you used the optional **time-lock (Veil)**. By default, your message is encrypted on your device to each recipient's own key — so only the people you named can ever read it, but a named recipient *could* in principle read it from the chain before the timer fires. If you turn on the **Veil** time-lock, the in-house Warden federation withholds the decryption gate until the contract records execution, so even the recipient cannot read it until then. Veil is a **preview** today (the federation is operator-run on the testnet), so do not yet rely on the timing as a guarantee. Confidentiality — that only your named recipients can read it — is real with or without Veil.

### Can I send crypto to someone through Maktub?

Not directly — Maktub does not move tokens. What people do is put their wallet's seed phrase in the payload. When the timer expires, the recipient decrypts the payload, gets the seed phrase, and imports the wallet on their device. The crypto moves because the recipient now controls the wallet, not because Maktub transferred it.

### What happens if I die?

If you set a reasonable interval (say, 180 days), the protocol notices when you stop checking in. On the day your timer expires, executors trigger delivery, and your named recipients can decrypt and read what you wrote. They can do this any time after that, forever.

### What happens if I check in from my hospital bed and then recover?

Nothing dramatic. You just keep checking in. The heartbeat was never going to fire, because you never missed a check-in.

---

## Safety and security

### Can Maktub read my message?

No. The protocol encrypts on your device before anything is uploaded. Maktub the team cannot read it. The storage layer cannot read it. The executor network cannot read it. Only the recipients you named can, and only after the timer expires.

### Is Maktub private? Can anyone see who I am messaging?

Be precise here, because it matters. Maktub protects the **content** of your message, not the **fact** of it. Your payload is encrypted on your own device, so only the recipients you named can ever read it — that part is genuinely private, and stays private forever.

Everything around the content is public. Because Maktub runs on a public blockchain, anyone can see that your wallet created a heartbeat, which addresses you named as recipients, and when delivery happened. That record is permanent and cannot be deleted.

So the honest sentence is: **the content is private; the metadata is not.** "End-to-end encrypted" is accurate. "Anonymous" or "fully private" would be an overclaim, and we do not use those words. This is, in fact, a weaker position on metadata than a mainstream encrypted messenger such as Signal or SimpleX, where who-contacts-whom is hidden from the public. On Maktub, the link from your wallet to your recipients is visible to everyone.

If hiding *who you are in contact with* is part of your threat model — source protection, whistleblowing — do not rely on Maktub for that. At most, use a wallet that is not tied to your real-world identity, and understand that the link between that wallet and your recipients is still on-chain. Read the [Press Freedom guide](./press-freedom.md) and the [Safety Guide](./safety-guide.md) before depending on it.

### What if I lose my wallet?

You cannot check in. Your heartbeat will expire after one interval and deliver to your recipients. This is by design — the protocol cannot tell "lost wallet" from "died." If you have a recovery path (seed phrase in a safe place, a linked email account), use it. If not, the heartbeat will fire. See the [Safety Guide](./safety-guide.md) for more.

### What if my recipient loses their wallet?

If the heartbeat has not yet executed, you can update the recipient list to add a new address for them. If it has executed, the delivery is locked to the original address — there is no recovery. Choose recipients who are reliable with their own wallets.

### Can a court or government stop a heartbeat from firing?

Not at the protocol layer. The smart contracts are immutable and have no admin keys. A court can, of course, order a *person* to deactivate their heartbeat — the person then signs a deactivation transaction, and the protocol honors it because it came from the owner. What the protocol does not allow is a third party (including the Maktub team, including any government) to deactivate someone else's heartbeat.

### Can someone steal my wallet and create a fake heartbeat?

If someone has your signing key, they can sign any transaction you could. This is not unique to Maktub — it is true of any account-based crypto system. Protect your wallet with a strong passcode, hardware wallet if possible, and a trusted recovery path.

### What if Base L2 goes down?

Base has had high uptime. In the rare case of sequencer downtime, transactions queue and execute when service recovers. For safety-trigger use cases with short intervals (1-hour, 4-hour), choose intervals with enough slack to absorb a short outage. For longer-interval use cases, an hour-scale outage is irrelevant.

### What if Maktub the team disappears?

The protocol runs as long as Base runs. The core contracts have no admin; nobody's departure changes how they behave. The executor network is public and self-incentivized. The storage layer is independent. Anyone can build a new frontend using the MIT-licensed SDK. Maktub the team going away would be unfortunate for the reference app but would not stop the protocol.

---

## Cost and tokens

### Why is there a creation fee?

The fee is set deliberately low — affordable almost anywhere on earth, comparable to the price of a phone call in many countries. It is high enough to prevent spam creation and low enough that someone on a very modest income can still afford it. The amount is deliberate and will not go up unless the community votes to change it.

### Why does it cost anything at all?

Two reasons. First, a free operation can be spammed at infinite volume; the fee makes that uneconomical. Second, the fee sustains a small protocol treasury that funds audits, infrastructure, and development. It is not a profit center.

### Can the fee change?

Yes, through governance. MKTB holders can vote to raise or lower the fee. There is no automatic inflation; any change is a deliberate, on-chain decision.

### What is $MKTB?

A governance token. Holders can vote on protocol parameters and treasury spending. Executors stake it to participate in the network. That is the scope of its utility. It is not a payment rail — user fees are in ETH, not MKTB — and the protocol does not require you to hold any MKTB to use it.

### How is MKTB distributed?

Fair launch. 35% to executor rewards (emitted over 10 years), 25% to a community treasury, 15% to liquidity, 12% to team on a 4-year vest with a 1-year cliff, 10% to ecosystem grants, 3% to a launch fund. No VC. No presale. See [Protocol Specification](../developer/protocol-spec.md) for details.

### Will MKTB be listed on exchanges?

That depends on exchanges, not on us. The team's job is to ship a working protocol and a fair-launched token. Secondary markets happen wherever people choose to trade.

---

## Technical

### What chain is this on?

Base L2, which is a Layer 2 rollup on Ethereum. It has 2-second blocks and very low transaction fees. Base is operated by Coinbase and settles to Ethereum mainnet for security.

### Is the code open source?

Yes. The smart contracts and SDK are MIT-licensed. The reference web application is under a Business Source License that converts to MIT two years after deployment. Documentation is CC BY 4.0.

### Has it been audited?

Audit is in progress as of April 2026. The codebase is also deployed on Base Sepolia testnet for public review. See [Protocol Specification](../developer/protocol-spec.md) for the current status and audit report links when available.

### Can I run my own executor?

Yes. See [Running an Executor Node](../executor/running-a-node.md). The software is open source, runs on a small VPS, and earns MKTB for executing expired heartbeats.

### Can I build my own app on top of Maktub?

Yes. See [Deploying Your Own App](../developer/deploying-own-app.md) and [Integration Guide](../developer/integration.md). You can fork the reference app, build a completely different one, or integrate heartbeat functionality into an existing product.

### What if I want to use a different encryption layer?

The protocol expects the payload to be bytes. What those bytes represent is a convention between the owner and the recipient. The reference stack encrypts in-app with ECIES on secp256k1 (per-recipient, hybrid), but another app could use a different scheme — even a symmetric key shared out-of-band — as long as the recipients agree on it. The contracts do not care.

---

## Edge cases and uncertainty

### Can a message be delivered to me I didn't expect?

Yes, if someone else created a heartbeat naming your address as a recipient. They had to pay the creation fee to do so, and your address had to be registered in the Recipient Registry. You cannot be forced to decrypt, but you cannot prevent delivery. If someone is using this to harass you, contact them and ask them to deactivate; if they won't, ignore it — unopened ciphertext is inert.

### Can I share my payload with additional people after delivery?

Yes. Once you decrypt, it's a plain file on your device. You can share it as you would any other file. The protocol's job ended at delivery.

### What if the recipient dies too?

If the recipient dies before the heartbeat fires, the payload is delivered to their address but may never be claimed. For estate use cases, consider naming a backup recipient.

If the recipient dies after the heartbeat fires but before they decrypt, the payload is inaccessible through their lost wallet. This is why we recommend that recipients decrypt soon after delivery rather than leaving it as a pending task.

### What if the payload storage is lost?

Payloads are stored on IPFS (pinned by Maktub and by third-party pinning services) and on Arweave (with permanent, paid storage). The protocol's economics assume both persist. If both vanish simultaneously — an extremely unlikely event — the delivery event still occurred but the ciphertext would be unrecoverable. There is active research into additional storage redundancy; see [Protocol Specification](../developer/protocol-spec.md).

### Is this real? How do I know the team won't just shut it down?

The smart contracts are deployed and immutable. Nothing the team does can change them. The reference app could be shut down — if that happens, a third-party app or a self-hosted deployment can read and write to the same contracts. The executor network is public and self-sustaining. What is deployed is deployed.

### What if I just want to try it to see how it works?

Create a test heartbeat with a 1-hour interval, name a wallet you also control, write a harmless message, and let it expire. You'll see the full cycle — creation, timer, execution, delivery, decryption — for the small one-time creation fee. Many people do this once before creating their real heartbeat.

---

## Related reading

- [Glossary](./glossary.md)
- [Safety Guide](./safety-guide.md)
- [How It Works](./how-it-works.md)
- [Getting Started](./getting-started.md)

