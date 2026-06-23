# Security Policy

Maktub is a set of **immutable** smart contracts. A deployed contract cannot be
patched in place — a fix ships as a **new immutable deployment** with opt-in
migration, and the old contract runs forever. That makes responsible disclosure
especially important: please give us the chance to ship and communicate a fix
before any public detail.

## Reporting a vulnerability

**Please do not open a public issue for security reports.**

Report privately through GitHub's **["Report a vulnerability"](https://github.com/bytesbrains/maktub/security/advisories/new)**
button (the repository's *Security → Advisories* tab). This opens a private
advisory visible only to you and the maintainers.

We aim to acknowledge a report within 72 hours and to keep you updated as we
assess and remediate.

## Scope

**In scope**
- The protocol contracts in `contracts/v3/` and their live deployments
  (addresses in `deployments/base-sepolia.json`).
- `@bytesbrains/maktub-sdk` (the `sdk/` package).
- The executor (`executor/`).

**Out of scope**
- The reference app, the `maktub_passkey` plugin, and the Warden network —
  please report those in their own repositories.
- Testnet-only concerns that don't affect mainnet safety (the protocol is
  pre-mainnet, live on Base Sepolia).
- Issues that require a compromised user device or stolen keys — the protocol
  delivers to whoever holds the recipient key, by design.

## What is and isn't a vulnerability

Maktub claims exactly two properties: **guaranteed delivery** and **content
confidentiality** (only the intended recipient can read a payload). It
deliberately does **not** claim metadata privacy — the sender↔recipient
relationship and the existence of a heartbeat are public and permanent on-chain.

- "Metadata is visible on-chain" describes **intended behavior**, not a bug.
- A non-recipient being able to **read** a payload (broken confidentiality), or
  a payload being **suppressed** or **delivered to the wrong party** (broken
  delivery), is exactly what we want to hear about.

## Disclosure & recognition

Maktub does not run a paid bug-bounty program. We credit disclosers in the
advisory and in the fix's release notes unless you prefer to remain anonymous.
We ask for coordinated disclosure: please give us a reasonable window to ship a
new immutable deployment and notify affected users before public details.
