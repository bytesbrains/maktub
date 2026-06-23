# Your First Heartbeat in 5 Minutes

A heartbeat is a message that you want delivered if you go silent. You write it once, choose who should receive it, set a timer, and check in periodically to keep the timer from running out. If you stop checking in, your recipients receive the message.

This guide walks you through creating your first heartbeat. It assumes no prior experience with crypto. You will need a phone or computer, a few minutes, and a small amount of funds (in ETH on Base) to cover the one-time creation fee plus a little for network costs.

> **This is not an emergency service.** If you or someone you love is in immediate danger, call local emergency services first. Maktub delivers messages after a timer expires — typically within minutes of expiry, but never in seconds. It is a quiet safeguard, not a 911 replacement.

---

## Table of contents

1. [Before you start](#1-before-you-start)
2. [Create a wallet](#2-create-a-wallet)
3. [Fund the wallet](#3-fund-the-wallet)
4. [Decide who receives your message](#4-decide-who-receives-your-message)
5. [Write the message](#5-write-the-message)
6. [Choose your timer interval](#6-choose-your-timer-interval)
7. [Create the heartbeat](#7-create-the-heartbeat)
8. [Check in](#8-check-in)
9. [What happens if you stop checking in](#9-what-happens-if-you-stop-checking-in)
10. [What to do next](#10-what-to-do-next)

---

## 1. Before you start

A heartbeat has three ingredients:

- **A message (payload).** Anything you want delivered. Seed phrase, password, a letter, GPS coordinates, a journalist's notes — the protocol never reads it.
- **Recipients.** One or more people who will receive the message if the timer runs out.
- **A timer.** The maximum time between check-ins. Minimum one hour. Maximum one year.

You will also need a wallet — essentially a crypto bank account used to sign the transactions. Creating one is free and takes a minute. Your recipients will also need wallets, but you can set the heartbeat up first and invite them afterwards.

## 2. Create a wallet

Open the Maktub app at [maktub.it](https://maktub.it). On the landing page, choose "Create a Heartbeat" and follow the prompts.

The app will offer two paths:

- **Sign in with email.** The app creates a wallet for you using account abstraction. You never see a seed phrase. You sign transactions by confirming on your phone. Best for most users.
- **Connect an existing wallet.** If you already use MetaMask, Coinbase Wallet, Rabby, or any WalletConnect-compatible wallet, connect it in one tap. Best if you already hold crypto on Base.

Either path gives you a Base L2 wallet address that looks like `0x` followed by 40 hexadecimal characters. Write this down or save it in your password manager — it is your identity on the protocol.

## 3. Fund the wallet

Creating a heartbeat costs a small one-time fee, paid in the Base network's native currency (ETH). Network fees (called "gas") add a negligible amount per transaction.

**If you signed in with email:** the app shows a "Top up" button. You can pay with a debit card, Apple Pay, or Google Pay through the onramp partner. A small top-up is more than enough for your first heartbeat and several months of check-ins.

**If you use an existing wallet:** bridge a small amount of ETH to Base using the [Base bridge](https://bridge.base.org) or buy ETH directly on Base through any exchange that supports withdrawals to Base.

You only need a tiny amount; a little goes a long way. If you accidentally send more, the extra stays in your wallet — nothing is trapped.

## 4. Decide who receives your message

Recipients are identified by wallet address. There are three ways to add someone:

- **They already have a Maktub wallet.** Ask them for their address or scan their QR code.
- **They are new.** Enter their email or phone number. The app creates a reserved slot for them and sends an invitation. They complete a free registration — typically a two-minute flow — to claim the slot. Creating a heartbeat for an unregistered recipient costs a small additional fee per recipient to pay for their onboarding.
- **They have a wallet but no registered encryption key.** Send them the registration link. Registration is free (network cost only) and must be done once, per recipient, ever.

You can add up to fifty recipients per heartbeat. Most people use one or two.

Before a heartbeat can be created, every recipient must be registered in the **Recipient Registry**. This is the contract that stores each recipient's encryption public key — the key your device uses to encrypt your message so only that recipient can read it. The app handles this behind the scenes; you just need to know that unregistered recipients need a few minutes to get set up.

## 5. Write the message

In the "Your Message" step, type or paste whatever you want delivered. The protocol encrypts it on your device before it ever leaves your phone. Maktub, the nodes that store the payload, and anyone intercepting the network traffic will see only ciphertext.

Some common messages:

- A seed phrase or private key for a crypto wallet
- A password manager master key plus recovery email
- A letter to a family member
- A GPS coordinate and emergency instructions
- A link to a cloud folder plus the unlock passphrase
- A journalist's notes, document URLs, and source identities

Keep the payload under a few kilobytes if you can. The app can also attach larger files to encrypted storage (IPFS) and include only the reference in the on-chain heartbeat; that flow is automatic for attachments over 2 KB.

## 6. Choose your timer interval

The interval is the maximum time between check-ins. If you do not check in within one interval, the heartbeat becomes **expired** and any executor can deliver it.

Pick an interval based on how often you are willing to check in:

| You check in... | Use this interval | Good for |
|---|---|---|
| Every 30–45 minutes | 1 hour | Active safety trigger (solo hike, field work) |
| Once a day | 24 hours | Traveling, reporting in a difficult place |
| Once a week | 7 days | Everyday safety net |
| Once a month | 30 days | Silence-triggered digital estate delivery |
| Twice a year | 180 days | Long-term will |
| Once a year | 365 days | Long-form inheritance |

You can change the interval later. You can also have multiple heartbeats at once — for example, a 1-hour heartbeat while hiking and a 180-day heartbeat for estate planning, with completely different recipients.

## 7. Create the heartbeat

Review the summary screen. It shows:

- The recipients (as wallet addresses, human names if you added them)
- A sealed preview of your payload (hash only — the app will not show you the decrypted message by default, to protect against shoulder surfing)
- Your interval
- The total fee in ETH (optionally with a fiat-equivalent estimate)

Tap **Create Heartbeat**. Approve the transaction in your wallet. Within a few seconds, the app will confirm that the heartbeat exists on-chain and assign it an ID.

The first check-in is automatic — creating the heartbeat starts the timer.

## 8. Check in

Checking in is free (you pay only a negligible amount of network gas). It resets the timer to full.

- Open the app.
- Tap the large check-in button on the dashboard.
- Approve the transaction.

That is the interaction. It should take less than ten seconds.

If you have the mobile app installed, it will send you a notification when your check-in is due. You can also set up email or SMS reminders.

**You do not have to wait until the last minute.** Check in any time during the interval. A check-in on day 3 of a 30-day timer is as valid as one on day 29.

## 9. What happens if you stop checking in

Suppose you set a 30-day interval, checked in last on May 1, and then went silent.

- **May 31, 00:00 UTC.** Timer expires. Your heartbeat becomes executable.
- **May 31, 00:00–00:10 UTC (typical).** An executor — an independent node staking MKTB — sees the expired heartbeat and submits the `execute` transaction. Delay from expiry to execution is usually 2–10 seconds and rarely exceeds a few minutes.
- **At execution.** The heartbeat is marked delivered on-chain. Your message was already encrypted to each recipient at creation time, so no re-encryption step is needed. (If you used the optional Veil time-lock, this on-chain execution is also the moment the Warden federation releases the time-lock gate — a preview feature.)
- **Any time after that.** Your recipients open the recipient view, see the delivered heartbeat, and decrypt the payload using their own key. There is no expiry — recipients can claim whenever they are ready, forever.

Executors are economically motivated to trigger expired heartbeats as fast as possible because they earn MKTB rewards for doing so. You do not need to trust any single one; you only need one working executor to exist.

## 10. What to do next

- **Save your wallet.** If you created a wallet through email login, export a recovery phrase and store it somewhere safe. If you lose access to the wallet, you cannot check in — which means your heartbeat will eventually execute. This is by design: the protocol cannot tell the difference between "the owner lost their key" and "the owner is gone."
- **Tell your recipients.** Make sure they know you created the heartbeat, and that they have downloaded the recipient app so they know how to claim it. Most heartbeats cause confusion on delivery not because the tech failed, but because the recipient didn't know what they were receiving.
- **Read the [Safety Guide](./safety-guide.md).** It covers the "what if?" scenarios: lost wallet, lost phone, network downtime, recipient onboarding.
- **Consider a second heartbeat.** Many people create one long-term heartbeat for estate purposes and a separate short-term one for travel or specific projects.

---

## Screens you will see (description)

If you are reading this before the app is available, here is what each screen looks like so you can follow along.

- **Landing.** A single line of serif text: "If I don't check in, deliver my message." One primary button: "Create a Heartbeat." Subtle link to sign in.
- **Sign in.** Two buttons: "Continue with email" and "Connect a wallet." Nothing else on the screen.
- **Dashboard.** If you have no heartbeats: a blank-page illustration and the words "Nothing is written yet." One button: "Write your first heartbeat." If you have heartbeats: a list. Each row shows a human-readable name you gave it, a large time-remaining number, and a check-in button sized for thumbs.
- **Create flow.** Four steps in sequence: recipients, message, timer, confirm. Each step is a single screen with one action. No side panels, no dashboards during creation.
- **Review.** The summary screen described above. The fee is shown in large serif type, denominated in ETH.
- **Success.** A quiet screen: "It is written." Heartbeat ID and a button to return to the dashboard.

---

## Related reading

- [How It Works](./how-it-works.md) — a plain-language explanation of what is happening under the hood
- [FAQ](./faq.md) — answers to the twenty questions everyone asks
- [Safety Guide](./safety-guide.md) — recovery and failure scenarios
- [Glossary](./glossary.md) — definitions for any unfamiliar word

