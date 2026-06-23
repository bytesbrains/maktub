// Maktub Smart Wallet — Hardhat Ignition Deployment Module
//
// Deploys ONLY the MaktubSmartWalletFactory.
//
// The factory's constructor deploys exactly one MaktubSmartWallet implementation,
// which all user wallets will delegatecall into via ERC-1167 minimal proxies.
// Individual user wallets are NOT deployed here — they are user-triggered, deployed
// lazily by the bundler inside the first ERC-4337 UserOperation (initCode field),
// at the deterministic CREATE2 address derived from the user's passkey pubkey.
//
// Per SMART_WALLET_SPEC §3 (counterfactual deployment) and SW-2 deliverables.
//
// Usage:
//   npx hardhat ignition deploy ignition/modules/SmartWallet.js --network <net>
//
// No parameters required — the module is fully self-contained.

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("SmartWallet", (m) => {
  const factory = m.contract("MaktubSmartWalletFactory", [], {
    id: "MaktubSmartWalletFactory",
  });

  return { factory };
});
