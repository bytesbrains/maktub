# test/ — Contract Tests (Hardhat + Chai)

Scoped context for the Solidity test suite. Read alongside the root [`../CLAUDE.md`](../CLAUDE.md) and [`../contracts/CLAUDE.md`](../contracts/CLAUDE.md).

## Toolchain

- Hardhat + Chai. Tests target the v3 contracts compiled from `../contracts/v3/`.
- **Foundry (invariant/fuzz), alongside Hardhat.** `test/invariant/*.t.sol` are
  Solidity stateful-invariant + fuzz suites run by `forge test` (config in
  `../foundry.toml`; `@openzeppelin` resolves via `../remappings.txt`, forge-std
  from `../lib/`). They run in the **`invariants`** CI job and are **gating**
  (unlike the report-only Slither/Aderyn jobs) — a broken invariant fails the
  build. Hardhat and Foundry never collide: Hardhat compiles only `contracts/v3`
  and runs only `*.js`; Foundry compiles/runs only `*.sol`, into `out/` +
  `cache_forge/`. Handler-based pattern: a handler contract exposes the fuzzed
  entrypoints and records ghost state; `invariant_*` functions assert the
  properties. Current suites: `MktbToken` (supply cap), `MaktubCore` (executed/
  deactivated terminal, no-ETH custody, `keccak(creator,salt)` id derivation +
  collision-resistance, recipient-index dedup + no-miss), `ExecutorRewards`
  (stake solvency, pool cap + a deterministic cap-enforcement test, and a pin of
  the known `isActiveExecutor`-staleness-after-`setMinimumStake` behaviour).
- **Halmos (symbolic), the third layer.** `test/halmos/*.halmos.t.sol` hold
  `check_`-prefixed functions whose args are SYMBOLIC — each check proves its
  property for every input value, not a fuzzed sample. They live behind the
  `halmos` foundry profile (`[profile.halmos]` sets `test = "test/halmos"`, so
  `forge test` never sees them); run with `FOUNDRY_PROFILE=halmos halmos`
  (`pip install halmos`; settings in `../halmos.toml`). Gating **`symbolic`**
  CI job, halmos version pinned there. Current checks (Phase 3 of issue #6):
  `MaktubCore` (the committed fee curve over the whole valid domain, the
  `execute()` gate exact at `expiry` and `expiry+EXECUTION_GRACE`, expiry-view
  boundary semantics, `_page` bounds via the paged discovery views) and
  `ExecutorRewards` (halving-schedule window/exactness, the
  `setRewardPerExecution` hard cap, `currentRewardAmount` window + bound).
  Halmos limitation worth knowing: it cannot execute a path that allocates a
  memory array of SYMBOLIC length (solc zeroes it with a symbolic-size
  `calldatacopy`), so checks over array-returning paths must be shaped so the
  length is concrete per path — see the region-split pagination checks in
  `MaktubCore.halmos.t.sol` for the pattern.

## Layout

| Path | Contents |
|---|---|
| `test/*.test.js` | Unit suites, one per contract: `MaktubCore` (split into area files — see below), `MaktubFlash` (split into area files — see below), `ExecutorRewards` (split into area files — see below), `ExecutionRelay` (split into area files — see below), `MktbGovernance`, `MktbToken`, `RecipientRegistry`, `RecipientRegistryV2`, `SmartWallet`, `SmartWallet.webauthn`, `SmartWalletFactory.invariants`. |
| `test/helpers/` | Shared test fixtures (e.g. `maktubCoreFixture.js` — the `deployFixture` + `createDefaultHeartbeat` helpers reused by every `MaktubCore.*.test.js`). |
| `test/integration/` | `MaktubIntegration.test.js` — hits **live Base Sepolia**. Excluded from CI. Run only when you intend to transact. |
| `test/system/`, `test/production/` | System scenarios and ops/smoke scripts (the latter are **not** Hardhat tests). |

The `MaktubCore` suite is split across several focused files matched by the glob `MaktubCore.*.test.js` (create, checkin-execute, update, deactivate, views, fees, boundaries, boundaries-combined), each ≤200 LOC, all sharing `test/helpers/maktubCoreFixture.js`.

The `ExecutorRewards` suite is split across several focused files matched by the glob `ExecutorRewards.*.test.js` (staking, distribute, slash-governance, admin), each ≤200 LOC, all sharing `test/helpers/executorRewardsFixture.js`.

The `MaktubFlash` suite is split across several focused files matched by the glob `MaktubFlash.*.test.js` (flash, validation, fee, boundaries, adversarial), each ≤200 LOC, all sharing `test/helpers/maktubFlashFixture.js`.

The `ExecutionRelay` suite is split across several focused files matched by the glob `ExecutionRelay.*.test.js` (deployment, reward, gates, access-reentrancy), each ≤200 LOC, all sharing `test/helpers/executionRelayFixture.js`.

## Conventions & gotchas

- **CI runs unit test files listed explicitly by name** in [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml). A new unit test file **must be added to that list or CI won't run it.** Current list: `MaktubCore.*.test.js` (a glob covering every MaktubCore area file), `MaktubFlash.*.test.js` (a glob covering every MaktubFlash area file), `ExecutorRewards.*.test.js` (a glob covering every ExecutorRewards area file), `ExecutionRelay.*.test.js` (a glob covering every ExecutionRelay area file), `MktbGovernance`, `MktbToken`, `RecipientRegistry`, `RecipientRegistryV2`, `SmartWallet`, `SmartWallet.webauthn`, `SmartWalletFactory.invariants`. (A new `MaktubCore.*.test.js`, `MaktubFlash.*.test.js`, `ExecutorRewards.*.test.js`, or `ExecutionRelay.*.test.js` area file is picked up by its glob automatically; any other new suite must be added by name.)
- `test/integration/` hits live Sepolia and is **excluded from CI** — costs real testnet gas.
- Immutability invariants are part of the contract's guarantees — when touching a contract, assert the relevant invariant (no admin, no upgrade path) holds. See `SmartWalletFactory.invariants.test.js` for the pattern.

## Commands (run from repo root)

- `npx hardhat test` — full unit suite.
- `npx hardhat test test/MaktubCore.*.test.js` — the full (split) MaktubCore suite; or a single area file, e.g. `test/MaktubCore.create.test.js`.
- `npm run gas` — `REPORT_GAS=true hardhat test`.
