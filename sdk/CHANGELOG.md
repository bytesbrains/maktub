# Changelog

## 0.1.0-dev.5

**Breaking:** Veil is no longer re-exported from the package root. Import it
from `@bytesbrains/maktub-sdk/veil` instead — the named exports (`veilSeal`,
`veilOpen`, `veilUnwrap`, `combinePartials`, `conditionIdentity`,
`beatExecutedCondition`, `VEIL_CHAIN_ID`, `VEIL_PREVIEW`) are unchanged. Nothing
else moved, and no crypto output changed.

- **The package is now dual ESM + CommonJS, with an `exports` map** (#39).
  Previously it was CJS-only — `main` with no `module` field and no `exports` —
  so bundlers could not reliably tree-shake it and there was no way to ask for
  part of it. `.` and `./crypto` ship both formats; `./veil` is CommonJS, which
  is what it has always actually been.
- **A browser consumer can now take the crypto alone.**
  `@bytesbrains/maktub-sdk/crypto` is reading-key derivation, ECIES, and the
  hybrid envelope, with no `ethers`, no Veil, and no WebAssembly in the module
  graph. This is the substance of the change rather than a size optimisation.
  The root barrel used to reach `veil/veil.js`, which imports vendored
  wasm-bindgen glue built for the *nodejs* target — it does
  `require('fs').readFileSync(...)` and instantiates the module at
  module-evaluation time. So importing a single HKDF function evaluated that
  glue: in a browser bundle it broke outright, and where it did load it cost the
  consuming origin a `wasm-unsafe-eval` in its CSP. That is the wrong trade to
  force on precisely the origin deriving reading keys, because a reading key is
  long-lived and its published half is write-once — one injected script that
  reads it decrypts everything that user has ever received, unrotatably.
  `script-src 'self'` is achievable again.
- `"sideEffects"` is declared, naming the Veil wasm glue as the one module that
  has any, so bundlers can drop unreached code from the rest.
- **`@noble/curves` and `@noble/hashes` are now declared dependencies.** The
  crypto layer has always imported them directly, but neither was in
  `dependencies` — they resolved only because `ethers` happened to hoist them
  into place. Under pnpm's strict layout, Yarn PnP, or any bundler resolving the
  same way, `@bytesbrains/maktub-sdk/crypto` would fail to resolve. The
  versions resolve to the same ones `ethers` already pins, so no code changed.
- `npm run verify:packaging` (part of `npm run build`, so CI and the publish
  workflow both run it) checks the claims above against `dist/` rather than
  trusting them: every `exports` target exists, the ESM tree contains no wasm,
  and importing `./crypto` with the `WebAssembly` constructors trapped
  instantiates nothing.

### Migrating

`import { MaktubClient } from "@bytesbrains/maktub-sdk"` is unchanged, in both
ESM and CommonJS. Two things to know:

- If you used Veil, change the import path (above).
- The `exports` map means deep paths into `dist/` are no longer reachable —
  `@bytesbrains/maktub-sdk/dist/crypto/ecies.js` and the like. Use `.`,
  `./crypto`, or `./veil`. The two documented data paths still work exactly as
  before: `@bytesbrains/maktub-sdk/vectors/reading-key.json` and
  `@bytesbrains/maktub-sdk/deployments/base-sepolia.json`.

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
