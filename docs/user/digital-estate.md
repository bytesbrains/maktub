# Digital Estate

A guide for using Maktub to pass digital credentials, wallets, and information to the people who should receive them when you are no longer here.

This guide is for:

- People with cryptocurrency they do not want to lose
- Parents, spouses, and partners who keep records the household depends on
- Anyone whose password manager holds the keys to things their family will need

The protocol does not replace a legal will. It complements one. A legal will says *who* inherits; Maktub ensures that when the time comes, the people named in that will can actually *reach* what they inherit.

---

## Table of contents

1. [The problem](#the-problem)
2. [The Maktub approach](#the-maktub-approach)
3. [What to put in the payload](#what-to-put-in-the-payload)
4. [Choosing recipients](#choosing-recipients)
5. [Choosing an interval](#choosing-an-interval)
6. [Practical setup: a 30-minute walkthrough](#practical-setup-a-30-minute-walkthrough)
7. [Coordination with a legal will](#coordination-with-a-legal-will)
8. [Edge cases and failure modes](#edge-cases-and-failure-modes)
9. [Maintenance over years and decades](#maintenance-over-years-and-decades)

---

## The problem

Between two and four million Bitcoin are permanently lost — an immense amount of value locked in wallets whose owners died, forgot their seed phrase, or never wrote it down. Behind almost every one of those wallets is a family that got nothing.

Crypto is the dramatic case, but the broader problem is larger and quieter. When someone dies without leaving credentials behind, their family spends months — sometimes years — dealing with:

- Locked password managers
- Email accounts and cloud storage with photo archives and records
- Bank and brokerage accounts that require death certificates and probate court orders
- Business accounts with ongoing operations
- Cryptocurrency wallets and exchange accounts that are not covered by any legal system
- Subscription services that continue billing long after the person has died

A lawyer with a will has no power over a password. Probate cannot open a self-custody wallet. A locked iPhone does not care what the court says.

The only workable solution is to leave a trail of credentials behind — and to do so in a way that is secure while you are alive and accessible when you are not.

## The Maktub approach

A digital estate heartbeat is a single encrypted message containing whatever your family needs to carry on your digital life. You write it once. You check in occasionally — typically once every 180 or 365 days. If you stop checking in, your named recipients receive it.

The properties that make this work:

- **Secure while you are alive.** The payload is encrypted. No one — not Maktub, not the executor network, not the storage layer — can read it until it is delivered.
- **Available when you are not.** Delivery does not require a court order, a lawyer's help, or any institution's cooperation. It is triggered by the simple fact of your absence.
- **Cheap enough to be universal.** A small one-time fee to create. Free check-ins. There is no subscription to lapse when your bank account closes.
- **Permanent.** Once delivered, your recipients have the decrypted information for as long as they keep it. They cannot "lose access" later.
- **Private until the last moment.** You can update the payload and the recipient list for years without anyone ever seeing the contents.

## What to put in the payload

A well-structured digital estate payload usually includes four layers.

**Layer 1: The master key.** The single credential that unlocks everything else.

- Password manager master password (1Password, Bitwarden, KeePass, etc.)
- Recovery phrase for password manager if it supports one
- Recovery email address and how to access it
- Master encryption key if you use one

This is the only layer that is time-critical. As long as your family has the password manager unlock, they can recover everything else the slow way.

**Layer 2: Sovereign assets.** Things that cannot be recovered through customer service.

- Bitcoin, Ethereum, and other cryptocurrency wallet seed phrases
- Hardware wallet PINs and the location of the hardware wallet itself
- Self-hosted encryption keys (PGP, age)
- Backup decryption keys for encrypted cloud backups

For each, include the name of the wallet software, the network, and any additional steps. Example:

```
Bitcoin wallet: "Long-term holdings"
Software: BlueWallet on iPhone
Seed phrase: [12 or 24 words]
Passphrase: [if used — without this, the seed phrase is useless]
Location of hardware wallet: top drawer of the desk, in the black case
PIN: [6 digits]
```

**Layer 3: Practical instructions.** Context that keeps your family out of avoidable mistakes.

- Which accounts to cancel immediately (subscriptions)
- Which accounts to preserve (business, domain names, family photo archives)
- Where physical documents are stored (passport, deeds, tax records)
- The person to contact for the life insurance policy
- The name and contact of your accountant or attorney

**Layer 4: A letter.** Not strictly practical, but important. Many people use the payload not just as a vault but as a final letter — a quiet, private place to say what you wanted to say.

A useful structure for the payload: plain text, with headings. A password manager export file is fine. A PDF is fine. A single `.txt` file with clear sections is probably best, because it will open on any device without special software.

## Choosing recipients

For most families, one primary recipient is correct: the spouse, partner, or adult child who will handle the estate. More than one primary recipient creates coordination overhead at a moment when they will not want overhead.

Consider adding **one backup recipient** in case your primary is also affected. A trusted sibling, long-time friend, or adult child who lives elsewhere.

**Avoid naming a pool of relatives.** Every recipient can decrypt the full payload — they will each see your full password list. Most people do not want that. Name the person or people who are genuinely the right custodians.

**The named recipients must have Maktub wallets and must be registered.** This is a one-time, free setup for them. If they do not already have a wallet, the app will onboard them through email — the flow takes a few minutes. They do not need to hold any cryptocurrency to receive payloads, only to claim them (and even that gas can be prepaid by you).

If you are naming a young person, plan for the decade ahead. Minor children become adults. Primary relationships change. Review the recipient list every year or two.

## Choosing an interval

For digital estate, **180 days (six months) is the most common choice**. You check in twice a year. A phone reminder twice a year is easy to maintain without being annoying. And a six-month gap after your last check-in is short enough that your family will still need the information and long enough that a brief hospitalization or a lost phone does not accidentally trigger delivery.

**365 days** (once a year) is a reasonable alternative for people who dislike recurring reminders. The tradeoff: if you lose access to your wallet, your family waits up to a year before receiving the payload.

**Shorter intervals** (30 days, 90 days) are typical for older users or users in poor health. A 30-day heartbeat means your family waits at most a month after you go silent.

**Longer intervals** (over 365 days) are not permitted at the protocol level. The maximum is 365 days.

## Practical setup: a 30-minute walkthrough

The full setup takes roughly half an hour the first time. You will do most of this once and almost never touch it again.

**Step 1 (5 minutes): Sit down with your password manager.** Export a record of every credential you want to pass on. Some password managers can export a plain-text CSV. If yours does not, copy the relevant entries into a text file.

**Step 2 (5 minutes): Add your seed phrases and non-password secrets.** Paste them into the same text file. Organize into sections as described above.

**Step 3 (5 minutes): Write a short letter.** Start with: *"If you are reading this, it means I did not check in. Here is what you need to know."* Then add anything else you want to say.

**Step 4 (3 minutes): Create or confirm your recipients' Maktub accounts.** If they do not have accounts, send them a link and wait until they have registered before continuing. You can leave this page open and come back.

**Step 5 (3 minutes): Create the heartbeat.** In the Maktub app, choose "Create heartbeat," paste the text, add the recipients, and set the interval to 180 days. Pay the small one-time creation fee.

**Step 6 (2 minutes): Tell your recipients.** Let them know they are named on a heartbeat, what the payload contains in general terms, and that they will receive it if they stop hearing from you for more than six months. You do not have to show them the payload.

**Step 7 (optional, 7 minutes): Document it in your legal estate plan.** Add a sentence to your will or trust: "Digital credentials have been deposited in a conditional-delivery system. Recipients are [names]. They will receive the credentials automatically." This tells your lawyer and executor that the credentials exist without revealing them.

That's it. Now check in every six months, forever.

## Coordination with a legal will

Maktub is not a substitute for a legal will. It is a delivery mechanism for things a will cannot handle.

A will says: *"My Bitcoin goes to my daughter."* Great. But if your daughter cannot sign a transaction, the will does nothing. Maktub delivers the seed phrase so she can.

**Who should Maktub's recipient be, the heir or the executor?** Usually the heir directly — the person who is going to actually use the credentials. If your will names a trustee who will distribute assets, you may want the trustee as the Maktub recipient instead. There is no rule; think about who will be most functional with the information in the first days after your death.

**Should I tell my lawyer?** Yes. Mention the existence of the heartbeat. They do not need the contents. They do need to know that the digital assets are not orphaned.

**Does Maktub violate any estate laws?** No. Maktub is a messenger. The delivery of a password does not transfer property — the property passes according to whatever legal regime governs it (your will, intestacy law, etc.). Maktub just makes sure the rightful heir can actually reach the asset.

Note: in some jurisdictions, unauthorized access to a deceased person's accounts is a crime, even by the heir. This is a law problem, not a Maktub problem. If you live in such a jurisdiction, speak with an estate attorney about whether to grant digital access explicitly in your will (many jurisdictions allow this since the RUFADAA or similar legislation). Maktub delivers the credentials; your legal plan authorizes their use.

## Edge cases and failure modes

**You lose your wallet.** You can no longer check in. After one interval, the heartbeat executes and your recipients receive the payload earlier than you would have liked. There is no way to recover: the protocol cannot distinguish "lost wallet" from "died." This is why the `deactivate` function exists — if you lose your wallet but still have access to your email-linked account through recovery, you can stop the heartbeat from ever firing. Read the [Safety Guide](./safety-guide.md).

**A recipient loses their wallet.** They can no longer decrypt. If the heartbeat has not yet executed, you can update the recipient list to add a new wallet for them. If it has executed, the payload is delivered to the original recipient address and there is no recovery. Choose recipients who are reliable with their own wallets, or plan a backup recipient.

**You die before your recipient registers.** If a recipient has not yet registered their encryption key, they cannot decrypt. Pre-paid registration slots solve this: if you pay the registration fee when creating the heartbeat, the slot is reserved for the recipient's future registration. After delivery, the recipient can complete registration and then claim the payload.

**Base L2 is down for an extended period.** Check-ins that cannot be submitted to Base fall back to L1 (Ethereum), which costs more but works. In practice Base has been highly available; treat this as a theoretical concern. See the [Safety Guide](./safety-guide.md) for details.

**Someone else gets your phone while you are alive and creates a fake heartbeat.** They would need your wallet's signing key or to be logged into your account. The heartbeat they create is on their authority, not yours — its creation fee comes from whichever wallet paid, and it only delivers to whoever *they* name. This is a wallet security problem, not a protocol problem.

**You want to stop the heartbeat entirely.** Call `deactivate` on the heartbeat. This is irreversible — a deactivated heartbeat can never fire and cannot be re-enabled. You would then create a new heartbeat if you want the safeguard back.

## Maintenance over years and decades

A digital estate heartbeat is a decades-long commitment. Plan for that.

**Every check-in: take 30 seconds.** Open the app, confirm the check-in, close the app. This is the point of a long interval — the maintenance cost must be small enough that you actually do it.

**Every year: review the recipients.** Did anyone move abroad? Did anyone become estranged? Did anyone have a major life change? Update the recipient list if needed. Updating recipients resets the timer as a safety measure — it does not silently hand your payload to the wrong person.

**Every year or two: refresh the payload.** Old passwords rotate. New accounts appear. Old accounts close. Do a 15-minute review and replace the payload. The old ciphertext on IPFS becomes orphaned and eventually garbage-collected; only the new one points from the heartbeat.

**Every few years: tell your recipients again.** People forget. A quick "hey, remember I set this up; if you ever get a Maktub notification, it's real" goes a long way.

**If your life situation changes significantly:** marriage, divorce, new child, business sale, emigration. Take half an hour. Revisit the heartbeat top to bottom. For major life changes, often the cleanest path is to create a new heartbeat and deactivate the old one.

---

## Related reading

- [Getting Started](./getting-started.md)
- [Safety Guide](./safety-guide.md) — lost wallet, recipient onboarding, network outages
- [How It Works](./how-it-works.md) — the mechanics behind all of this
- [FAQ](./faq.md)

