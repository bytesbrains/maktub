# Contributing to Maktub

Thanks for your interest. This repository is the **open foundation** (MIT) of the
Maktub Protocol — the contracts, the TypeScript SDK, and the executor. The
end-user app, the passkey plugin, and the Warden network live in their own
repositories.

## Where things live

| You want to change… | Repo |
|---|---|
| Protocol contracts, SDK, or executor | **here** (`bytesbrains/maktub`) |
| The Flutter reference app | its own repo |
| The WebAuthn passkey plugin | `maktub_passkey` (pub.dev) |
| The Warden conditional-decryption network | `bytesbrains/warden` |

## What we welcome — and what's frozen

- **SDK, tooling, tests, docs, executor** — contributions here are very welcome.
  The SDK is the active developer surface.
- **The contracts are immutable by design.** A deployed contract has no admin, no
  proxy, and no upgrade path, so we cannot change the behavior of a live contract
  — and we won't accept PRs that try to add one (admin keys, pausing,
  upgradeability, or any governance over the immutable core). Improvements to
  protocol behavior ship as a **new immutable deployment**, evaluated against the
  new-citizen gate in [`docs/developer/protocol-family.md`](docs/developer/protocol-family.md) §9.
  If you have an idea at that level, **open a proposal issue first** rather than a
  PR.
- Pre-mainnet, contract bug fixes and hardening (before the contracts are frozen
  on mainnet) are welcome via that same gate.

## Ground rules

- **No fiat in docs or code** — the protocol is wei/ETH-native. No `$`/`USD`
  amounts.
- **Honest copy** — Maktub claims guaranteed delivery and content
  confidentiality, never metadata-invisibility or anonymity (see the README's
  honesty note).

## Development

```bash
# Contracts (from the repo root)
npm install
npx hardhat compile
npx hardhat test

# SDK
cd sdk
npm install
npm run typecheck
npm run build
npm test
```

## Pull-request workflow

1. Fork and create a topic branch — never push to `main`.
2. Keep changes focused; add or update tests for anything you change.
3. Make sure **CI is green** — contracts compile + test, SDK build + test, and
   the secret scan.
4. Fill in the PR template: the problem, what you changed, the blast radius and
   reversibility, and any downstream impact (SDK consumers, deployed contracts).
5. A maintainer reviews and merges. On-chain-affecting changes get extra
   scrutiny.

## Security

Found a vulnerability? **Don't open a public issue** — see
[`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under this
repository's **MIT** license.
