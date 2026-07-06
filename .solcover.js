// solidity-coverage configuration for the full v3 protocol.
//
// Previously scoped to the smart-wallet directory only (SW-2), which left the
// crown-jewel core contracts (MaktubCore, ExecutorRewards, MktbGovernance,
// MktbToken, RecipientRegistry[V2], ExecutionRelay, MaktubFlash) with NO
// coverage measurement at all. For an immutable, no-upgrade protocol that is a
// gap in its own right — you cannot know what the units miss if you never
// measure. This config now instruments the entire v3 tree.
//
// Only the `mocks/` directory is skipped: those are test-only helpers (e.g.
// ReentrantCreator) and are not deployed, so their coverage is noise. Skipping
// the whole directory (not a single file) keeps this correct as mocks are added.
// Paths are relative to `paths.sources` (contracts/v3), per hardhat's config.
//
// The coverage run is driven by `npm run coverage`, which points solidity-
// coverage at the unit + system suites only. The live-Sepolia `integration/`
// suite and the `production/` ops scripts are deliberately excluded — they need
// a funded network account and would fail (and cost gas) under coverage.

module.exports = {
  skipFiles: [
    "mocks",
  ],
  configureYulOptimizer: true,
};
