# Changelog

## 0.1.0-dev.4

- The packaged **carrier** (`deployments/base-sepolia.json`) now ships ten
  contracts: `maktubSmartWalletFactory` and `maktubSmartWalletImplementation`
  join the existing eight. Both are direct inputs to counterfactual smart-wallet
  address derivation — the normal case, since a wallet only deploys on its
  owner's first action — so every consumer previously kept a hand-copied pair
  outside the drift check the carrier exists to provide. A factory or
  implementation redeploy would have left those consumers deriving addresses on
  the previous stack with nothing to signal it; because a recipient's reading key
  is published against a derived address, that is an account-level fault rather
  than a display one (#32). The addresses themselves are unchanged.
- The same two addresses are now on the TypeScript `SEPOLIA_CONTRACTS`
  constant, and `ContractAddresses` carries them as optional fields — otherwise
  TypeScript consumers kept hardcoding the values the carrier had just started
  distributing.
- The canonical cross-language vectors (`vectors/reading-key.json`) ship in the
  tarball. Language ports outside this repository can now assert against the
  fixture pinned to a published SDK version — `require(
  "@bytesbrains/maktub-sdk/vectors/reading-key.json")` — instead of copying the
  bytes by hand, which reintroduced exactly the divergence the fixture was
  written to remove. The repo-root `vectors/` stays the single source of truth;
  the package copy is written at build time.
- No API or behavior change; crypto output is identical.

## 0.1.0-dev.3

- Ship the canonical deployment record as a packaged **carrier** at
  `deployments/base-sepolia.json` (addresses + chainId + deploy blocks),
  generated from the protocol's `deployments/base-sepolia.json` by
  `scripts/gen-addresses.mjs` and included in the published tarball. This lets
  non-TypeScript downstreams (the Flutter app) pin an SDK **version** and
  regenerate their own constants from it instead of syncing files across repos
  (#87). No API change; the TypeScript address constants are unchanged.

## 0.1.0-dev.2

- Rebuilt the bundled **Veil** warden wasm with remapped build paths, so the
  binary no longer embeds absolute local source paths in its debug strings. No
  API or behavior change; crypto output is identical (cross-language vectors
  unchanged).

## 0.1.0-dev.1

- First public **pre-release** of `@bytesbrains/maktub-sdk` (published under the
  `dev` dist-tag). Typed TypeScript API over Maktub Protocol v3 on Base L2:
  `MaktubClient` (heartbeat / recipient / executor / token / governance / flash
  ops), contract wrappers + ABIs + generated addresses, ECIES crypto, reading-key
  derivation (pinned cross-language vectors), and the **Veil** PREVIEW
  conditional-decryption layer (bundled warden wasm).
- Experimental: targets the Base Sepolia testnet deployment; pre-mainnet.
