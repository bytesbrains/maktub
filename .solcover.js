// solidity-coverage configuration scoped to SW-2 deliverables.
//
// SW-2 targets 100% line + branch coverage for the SmartWallet factory.
// The wallet implementation itself contains WebAuthn / P-256 verification paths
// covered by SW-3 (precompile + on-curve fixtures) and SW-4 (end-to-end passkey
// signing) — leaving the rest of the v3 codebase in scope here would create
// false coverage gaps that only the other sub-issues / suites can close.
//
// We therefore measure coverage against the wallet directory and skip the rest
// of the v3 contracts (which have their own dedicated test suites).

module.exports = {
  // Only instrument the smart-wallet contracts.
  skipFiles: [
    "core/ExecutionRelay.sol",
    "core/IExecutorRewards.sol",
    "core/MaktubCore.sol",
    "core/RecipientRegistry.sol",
    "governance/ExecutorRewards.sol",
    "governance/IMaktubCore.sol",
    "governance/MktbGovernance.sol",
    "token/MktbToken.sol",
  ],
  configureYulOptimizer: true,
};
