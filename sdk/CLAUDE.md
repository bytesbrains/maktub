# sdk/ — `@bytesbrains/maktub-sdk` (TypeScript)

Scoped context for the public developer SDK. Read alongside the root [`../CLAUDE.md`](../CLAUDE.md). This is the **public developer surface** — every vertical app builds on it.

## Toolchain

- TypeScript, compiled with `tsc` **twice** — ESM to `dist/esm`, CommonJS to `dist/cjs`. `tsconfig.base.json` holds everything the two share; `tsconfig.json` is editor/`typecheck` only and emits nothing. Note the `.js` import suffixes in source — required for Node ESM resolution.
- **Peer-dep on `ethers` v6** — do not bundle ethers; consumers bring it. `@noble/curves` + `@noble/hashes` are real `dependencies` (the crypto layer imports them directly; they must not go back to being resolved via ethers' hoisting, which broke strict-layout installs).
- License: MIT.

## Entry points — the `exports` map is the public shape

The package publishes three entries, and which code each one can reach is a **security property, not a packaging preference** (#39):

| Subpath | Tree | Reaches |
|---|---|---|
| `.` | esm + cjs | everything except Veil |
| `./crypto` | esm + cjs | `crypto/` only — no ethers, **no WebAssembly** |
| `./veil` | cjs only | Veil + the vendored wasm |

- **Never re-export Veil from `src/index.ts`.** The vendored glue is the *nodejs* wasm-bindgen target: it does `require('fs').readFileSync(...)` and instantiates the module at evaluation time. A root re-export makes that a side effect of importing anything at all — it breaks browser bundles outright, and where it loads it forces `wasm-unsafe-eval` into the CSP of the origin deriving reading keys. A reading key is long-lived and its published half is write-once, so that origin is the one place least able to afford a weakened policy.
- `src/veil` is excluded from `tsconfig.esm.json` for the same reason — the ESM tree must stay wasm-free, and excluding it makes that structural rather than a convention.
- `npm run verify:packaging` enforces all of it against `dist/` after a build (and `npm run build` runs it, so CI and the publish workflow both do). It checks every `exports` target resolves, that the ESM tree mentions no wasm, and that importing `./crypto` with the `WebAssembly` constructors trapped instantiates nothing. If you add an entry point, add it there too.
- `dist/esm/package.json` and `dist/cjs/package.json` (written by `scripts/finalize-dist.mjs`) mark each tree's module type. The root `package.json` deliberately has no `"type"` field — with both trees marked, it isn't load-bearing.

## Directory layout (`src/`)

| Path | Contents |
|---|---|
| `MaktubClient.ts` | Top-level client — the main entry point developers use. A thin composition: the `MaktubClient` class is `MaktubClientBase` (in `client/base.ts`) with the per-concern mixins from `client/` applied. Add new methods to the relevant mixin, not here. |
| `client/` | The `MaktubClient` implementation, split by concern: `base.ts` (state, init, contract wiring, protected guards) + chained mixins `heartbeatOps`, `recipientOps`, `executorOps`, `tokenOps`, `governanceOps`, `cryptoOps`, `flashOps`. Each mixin exports a function and a small `I*Ops` helper interface (the interfaces exist only so `tsc` can emit `.d.ts` for the mixin chain — not public API). |
| `contracts/` | Typed wrappers, one per contract: `MaktubCore`, `MaktubFlash`, `RecipientRegistry`, `RecipientRegistryV2`, `MktbToken`, `ExecutorRewards`, `MktbGovernance`. Wrappers that outgrew 200 LOC (`MaktubCore`, `MktbGovernance`, `ExecutorRewards`) follow the same mixin split as `MaktubClient`: `contracts/<Name>.ts` is a thin composition of `contracts/<name>/{base,writeOps,readOps}.ts` (base = contract wiring + the protected `_requireSigner` guard; the `I*Ops` interfaces exist only for `.d.ts` emission). |
| `crypto/` | ECIES-on-secp256k1 envelope encryption. `index.ts` is the public entry for the `./crypto` subpath (it re-exports `ecies.ts`); `ecies.ts` is a **barrel** re-exporting the focused submodules (`constants`, `types`, `bytes`, `aes`, `kdf`, `keypair`, `blob`, `bundle`, `hybrid`, `hybrid-decrypt`); import from `./crypto/ecies.js` as before (`Keypair`, `BytesInput`, `encrypt*`/`decrypt*`). Mirrors the v1 encryption layer — keep in sync with the encryption-layer research (operator-local). |
| `veil/` | **Veil (time-confidential Beats, PREVIEW).** `veil.ts` wraps Maktub's v2 hybrid envelope in Warden's threshold-IBE condition gate: `veilSeal` / `veilOpen` / `veilUnwrap` / `combinePartials` / `conditionIdentity` / `beatExecutedCondition`. The pairing crypto runs in `veil/wasm/` — **vendored** `warden-wasm` (wasm-bindgen, nodejs target) built from the Warden project (a separate repository; published as `warden_ffi` on pub.dev and `bytesbrains/warden` on Docker Hub). ⚠️ PREVIEW: timing is zero-security on the all-ours testnet; recipient confidentiality is real. See the Warden threat model and D-031 (operator-local). |
| `constants/abis.ts` | Contract ABIs — a **barrel** re-exporting one file per ABI from `constants/abis/` (`maktubCore`, `recipientRegistry`, `mktbToken`, `executorRewards`, `mktbGovernance`, `recipientRegistryV2`, `maktubFlash`). |
| `constants/addresses.ts`, `constants/sepolia_addresses.generated.ts` | Network addresses. **The `*.generated.ts` file is generated — do not hand-edit** (see below). |
| `types/index.ts` | Shared types, `ProposalState`, `VoteType`. |
| `errors/index.ts` | Typed error classes. |
| `index.ts` | Public barrel for `.` — anything not re-exported here is not public API. **Veil is deliberately absent**; see *Entry points* below. |

## Conventions & gotchas

- **Addresses are generated, single-source.** `constants/sepolia_addresses.generated.ts` comes from [`../deployments/base-sepolia.json`](../deployments/base-sepolia.json) via `node scripts/gen-addresses.mjs` (run from repo root). After any redeploy, regenerate — never hand-edit address literals. See the redeploy checklist in [`../scripts/CLAUDE.md`](../scripts/CLAUDE.md).
- **Adding a contract to the deploy record does NOT publish it.** `gen-addresses.mjs` builds the carrier from an explicit allow-list, so a new entry in `deployments/base-sepolia.json` reaches consumers only once it is added there too. Anything a client needs — including addresses it merely derives from, like the smart-wallet factory + implementation — must be on that list, or each consumer hardcodes it outside the drift gate (#32).
- **`vectors/` is a build artifact, gitignored.** `npm run copy:vectors` copies the tracked repo-root [`../vectors/reading-key.json`](../vectors/reading-key.json) into `sdk/vectors/` so it ships in the tarball (`package.json#files`) and language ports can assert against a fixture pinned to a published version. The root copy stays the single source of truth — never edit `sdk/vectors/`, and never commit it.
- New public exports must be added to `index.ts` and use `.js` suffixes in their own imports.
- **Vendored wasm (`veil/wasm/`)** is the committed `warden-wasm` pkg (the `.wasm` + glue). Regenerate after any change to Warden's wasm crate (separate repository): `wasm-pack build --target nodejs --out-dir pkg` in that crate, then copy `pkg/{warden_wasm.js,warden_wasm_bg.wasm,*.d.ts}` into `sdk/src/veil/wasm/`. Building the pkg needs current-stable Rust (the crate stays pinned to 1.83). `tsc` does **not** copy the `.wasm` into `dist/` — `npm run copy:wasm` does, into `dist/cjs/veil/wasm/` **only** (the ESM tree must stay wasm-free; see *Entry points* above). The wasm boundary is **0x-less hex** (strip `0x` from `bytesToHex` before passing in).
- Adding a contract wrapper? Add the ABI as a new file under `constants/abis/` (and re-export it from the `constants/abis.ts` barrel), the wrapper to `contracts/`, and export from `index.ts`.
- **Tests** are colocated as `*.test.ts` next to the module they cover (vitest). They're excluded from the build (`tsconfig.json` → `exclude`). Add a test alongside any new module. Keep every source file ≤200 LOC (see #187) — when a module grows past that, split it and barrel-re-export.

## Commands (`cd sdk`)

- `npm run build` — both trees (`build:esm`, `build:cjs`), then `finalize:dist`, `copy:wasm`, `copy:vectors`, `verify:packaging`.
- `npm run verify:packaging` — the #39 regression gate. Needs a build first.
- `npm run typecheck` — `tsc --noEmit`, type-check only.
- `npm test` — `vitest run` (colocated `*.test.ts`). `npm run test:watch` for watch mode.
- `npm run clean` — `rm -rf dist vectors`.
