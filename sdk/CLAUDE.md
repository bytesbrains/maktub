# sdk/ — `@bytesbrains/maktub-sdk` (TypeScript)

Scoped context for the public developer SDK. Read alongside the root [`../CLAUDE.md`](../CLAUDE.md). This is the **public developer surface** — every vertical app builds on it.

## Toolchain

- TypeScript, compiled with `tsc` to `dist/`. ESM (note the `.js` import suffixes in source — required for Node ESM resolution).
- **Peer-dep on `ethers` v6** — do not bundle ethers; consumers bring it.
- License: MIT.

## Directory layout (`src/`)

| Path | Contents |
|---|---|
| `MaktubClient.ts` | Top-level client — the main entry point developers use. A thin composition: the `MaktubClient` class is `MaktubClientBase` (in `client/base.ts`) with the per-concern mixins from `client/` applied. Add new methods to the relevant mixin, not here. |
| `client/` | The `MaktubClient` implementation, split by concern: `base.ts` (state, init, contract wiring, protected guards) + chained mixins `heartbeatOps`, `recipientOps`, `executorOps`, `tokenOps`, `governanceOps`, `cryptoOps`, `flashOps`. Each mixin exports a function and a small `I*Ops` helper interface (the interfaces exist only so `tsc` can emit `.d.ts` for the mixin chain — not public API). |
| `contracts/` | Typed wrappers, one per contract: `MaktubCore`, `MaktubFlash`, `RecipientRegistry`, `RecipientRegistryV2`, `MktbToken`, `ExecutorRewards`, `MktbGovernance`. Wrappers that outgrew 200 LOC (`MaktubCore`, `MktbGovernance`, `ExecutorRewards`) follow the same mixin split as `MaktubClient`: `contracts/<Name>.ts` is a thin composition of `contracts/<name>/{base,writeOps,readOps}.ts` (base = contract wiring + the protected `_requireSigner` guard; the `I*Ops` interfaces exist only for `.d.ts` emission). |
| `crypto/` | ECIES-on-secp256k1 envelope encryption. `ecies.ts` is a **barrel** re-exporting the focused submodules (`constants`, `types`, `bytes`, `aes`, `kdf`, `keypair`, `blob`, `bundle`, `hybrid`, `hybrid-decrypt`); import from `./crypto/ecies.js` as before (`Keypair`, `BytesInput`, `encrypt*`/`decrypt*`). Mirrors the v1 encryption layer — keep in sync with the encryption-layer research (operator-local). |
| `veil/` | **Veil (time-confidential Beats, PREVIEW).** `veil.ts` wraps Maktub's v2 hybrid envelope in Warden's threshold-IBE condition gate: `veilSeal` / `veilOpen` / `veilUnwrap` / `combinePartials` / `conditionIdentity` / `beatExecutedCondition`. The pairing crypto runs in `veil/wasm/` — **vendored** `warden-wasm` (wasm-bindgen, nodejs target) built from the Warden project (a separate repository; published as `warden_ffi` on pub.dev and `bytesbrains/warden` on Docker Hub). ⚠️ PREVIEW: timing is zero-security on the all-ours testnet; recipient confidentiality is real. See the Warden threat model and D-031 (operator-local). |
| `constants/abis.ts` | Contract ABIs — a **barrel** re-exporting one file per ABI from `constants/abis/` (`maktubCore`, `recipientRegistry`, `mktbToken`, `executorRewards`, `mktbGovernance`, `recipientRegistryV2`, `maktubFlash`). |
| `constants/addresses.ts`, `constants/sepolia_addresses.generated.ts` | Network addresses. **The `*.generated.ts` file is generated — do not hand-edit** (see below). |
| `types/index.ts` | Shared types, `ProposalState`, `VoteType`. |
| `errors/index.ts` | Typed error classes. |
| `index.ts` | Public barrel — anything not re-exported here is not public API. |

## Conventions & gotchas

- **Addresses are generated, single-source.** `constants/sepolia_addresses.generated.ts` comes from [`../deployments/base-sepolia.json`](../deployments/base-sepolia.json) via `node scripts/gen-addresses.mjs` (run from repo root). After any redeploy, regenerate — never hand-edit address literals. See the redeploy checklist in [`../scripts/CLAUDE.md`](../scripts/CLAUDE.md).
- New public exports must be added to `index.ts` and use `.js` suffixes in their own imports.
- **Vendored wasm (`veil/wasm/`)** is the committed `warden-wasm` pkg (the `.wasm` + glue). Regenerate after any change to Warden's wasm crate (separate repository): `wasm-pack build --target nodejs --out-dir pkg` in that crate, then copy `pkg/{warden_wasm.js,warden_wasm_bg.wasm,*.d.ts}` into `sdk/src/veil/wasm/`. Building the pkg needs current-stable Rust (the crate stays pinned to 1.83). `tsc` does **not** copy the `.wasm` into `dist/` — a publish step must (the SDK isn't published yet). The wasm boundary is **0x-less hex** (strip `0x` from `bytesToHex` before passing in).
- Adding a contract wrapper? Add the ABI as a new file under `constants/abis/` (and re-export it from the `constants/abis.ts` barrel), the wrapper to `contracts/`, and export from `index.ts`.
- **Tests** are colocated as `*.test.ts` next to the module they cover (vitest). They're excluded from the build (`tsconfig.json` → `exclude`). Add a test alongside any new module. Keep every source file ≤200 LOC (see #187) — when a module grows past that, split it and barrel-re-export.

## Commands (`cd sdk`)

- `npm run build` — `tsc` to `dist/`.
- `npm run typecheck` — `tsc --noEmit`, type-check only.
- `npm test` — `vitest run` (colocated `*.test.ts`). `npm run test:watch` for watch mode.
- `npm run clean` — `rm -rf dist`.
