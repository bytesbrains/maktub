# Maktub Protocol — Documentation

> **Recipients + Payload + Timer = Heartbeat.**
> If you stop checking in, your message is delivered. That is the entire protocol.

Welcome. This is the public documentation for Maktub Protocol — a decentralized conditional execution engine on Base L2.

Maktub does one thing: it watches for your silence. You write a message, choose who receives it, and set a timer. If you stop checking in, the message is delivered to the people you named. Permanently, automatically, with no one in the middle who can stop it.

The protocol is content-agnostic. It never sees what you wrote. It only knows that you went quiet.

Creating a heartbeat costs a small one-time fee (paid in ETH on Base). Check-ins are free. Your recipients pay nothing. The code is open source and the core contracts are immutable — they cannot be changed, paused, or controlled by anyone, including the team that built them.

---

## Start here

If you are a person who wants to protect a family, a trip, or a story, start with the user docs. You do not need to know anything about crypto.

| Path | Read |
|---|---|
| New to Maktub | [Your first heartbeat in 5 minutes](./user/getting-started.md) |
| Passing digital assets to heirs | [Digital Estate guide](./user/digital-estate.md) |
| Solo travel, field work, SOS | [Safety Triggers guide](./user/safety-triggers.md) |
| Journalism and source protection | [Press Freedom guide](./user/press-freedom.md) |
| Curious how it works | [How It Works](./user/how-it-works.md) |
| Everything else | [FAQ](./user/faq.md) • [Safety Guide](./user/safety-guide.md) • [Glossary](./user/glossary.md) |

## For developers

| Path | Read |
|---|---|
| The canonical technical spec | [Protocol Specification](./developer/protocol-spec.md) |
| Every function, event, error | [Contract Reference](./developer/contracts.md) |
| TypeScript SDK | [SDK Reference](./developer/sdk.md) |
| Building on top of Maktub | [Integration Guide](./developer/integration.md) |
| Running your own frontend | [Deploying Your Own App](./developer/deploying-own-app.md) |
| Runnable examples | [Examples](./developer/examples.md) |

## For executors

| Path | Read |
|---|---|
| Running a node | [Running an Executor Node](./executor/running-a-node.md) |
| How rewards work | [Executor Economics](./executor/economics.md) |
| Operator questions | [Executor FAQ](./executor/faq.md) |

## For governance participants

| Path | Read |
|---|---|
| How MKTB voting works | [Governance Overview](./governance/overview.md) |
| Creating and voting on proposals | [Proposal Process](./governance/proposals.md) |
| Every tunable value | [Current Parameters](./governance/parameters.md) |

---

## What Maktub is

- A single smart-contract primitive on Base L2
- A small one-time creation fee (in ETH), free check-ins, free execution for users
- An MKTB governance token, fair-launched, no VC, no presale
- A public executor network that earns MKTB by triggering expired heartbeats
- An open source codebase (MIT for the protocol, BSL for the reference app for two years, then MIT)

## What Maktub is not

- It does **not** custody cryptocurrency, tokens, or any other assets
- It does **not** move funds on your behalf
- It is **not** a real-time emergency service — for life-threatening emergencies, always call local emergency services first
- It is **not** an identity system or a messenger

If you want to pass cryptocurrency to someone, you put your seed phrase or private key into the encrypted payload. When the timer expires, that recipient can decrypt the payload and import the wallet themselves. Maktub transports the information, not the asset.

## Licensing

| Component | License |
|---|---|
| Smart contracts (`contracts/v3/`) | MIT |
| TypeScript SDK (`@bytesbrains/maktub-sdk`) | MIT |
| Reference React application | BSL 1.1 — converts to MIT two years after deployment |
| Documentation (this directory) | CC BY 4.0 |

You can fork the contracts today. You can build an entirely different frontend today. You can run an executor node today. Nothing on the protocol layer is gated, permissioned, or proprietary.

## Status

- Smart contracts: deployed on Base Sepolia, audit in progress, mainnet pending
- SDK: published in-repo, npm release pending mainnet deployment
- Reference web app: functional, pre-1.0
- Mobile app: maintained in its own repository
- Executor node software: functional, usable today on Sepolia
- Governance: deployed, voting begins after mainnet launch

Live Base Sepolia addresses are listed in [Current Parameters](./governance/parameters.md).

## Website

[maktub.it](https://maktub.it) — project site.
[docs.maktub.it](https://docs.maktub.it) — these docs (deployed from `docs/`).

---

