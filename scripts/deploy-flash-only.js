// Deploys ONLY MaktubFlash (the D-039 canonical-state citizen, #211/#268)
// against the EXISTING RecipientRegistryV2 — it never redeploys the registry.
//
// Why Flash-only: RecipientRegistryV2 is unchanged since 2026-06-12, so the live
// one is current. Redeploying it would strand every existing key registration
// (eligible accounts become ineligible on a fresh registry) — exactly the #266
// failure at scale. The stock scripts/deploy-flash.js redeploys BOTH; use THIS
// script to refresh only the Flash citizen.
//
// Usage:
//   npx hardhat run scripts/deploy-flash-only.js --network baseSepolia
//
// Environment (from .env):
//   PRIVATE_KEY            — deployer key
//   BASE_SEPOLIA_RPC_URL   — optional RPC override (defaults to public RPC)
//   FEE_RECEIVER           — optional; defaults to the deployer EOA (testnet pattern)
//
// After this completes: the D-039 Flash is live, deployments/base-sepolia.json is
// updated (new MaktubFlash address, flashDeployBlock = its deploy block, the old
// Flash moved to `stale`), and RecipientRegistryV2 is untouched. Then run
// `node scripts/gen-addresses.mjs` and commit.

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENTS_PATH = path.join(
  __dirname,
  "..",
  "deployments",
  "base-sepolia.json"
);

// D-023 committed wei target: perRecipient = 5 µETH (Beat-base / 25). Unchanged.
const PER_RECIPIENT_FEE = 5_000_000_000_000n;

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"));

  const registryV2 = deployments.contracts.RecipientRegistryV2;
  if (!registryV2) {
    throw new Error(
      "No RecipientRegistryV2 in deployments/base-sepolia.json — deploy the " +
        "Flash stack first (scripts/deploy-flash.js)."
    );
  }
  const oldFlash = deployments.contracts.MaktubFlash;
  const feeReceiver = process.env.FEE_RECEIVER || deployer.address;

  console.log("Deployer:                       ", deployer.address);
  console.log("Reusing RecipientRegistryV2:    ", registryV2, "(NOT redeployed)");
  console.log("Superseding old MaktubFlash:    ", oldFlash);
  console.log("Fee receiver (immutable):       ", feeReceiver);

  // --- Deploy MaktubFlash (D-039) against the existing registry ---
  const Flash = await ethers.getContractFactory("MaktubFlash");
  const flash = await Flash.deploy(PER_RECIPIENT_FEE, feeReceiver, registryV2);
  await flash.waitForDeployment();
  const flashAddress = await flash.getAddress();
  const receipt = await flash.deploymentTransaction().wait();
  const deployBlock = receipt.blockNumber;
  console.log("\nMaktubFlash (D-039):            ", flashAddress, "@ block", deployBlock);

  // --- Sanity: D-039 surface present + wired to the EXISTING registry ---
  // The public RPC is load-balanced; a read node can briefly lag the write
  // node right after a deploy and return "0x" for a freshly-deployed contract.
  // Retry the reads so a transient lag doesn't abort an otherwise-good deploy.
  async function readWithRetry(label, fn, tries = 6) {
    for (let i = 0; i < tries; i++) {
      try {
        return await fn();
      } catch (e) {
        if (i === tries - 1) throw e;
        console.log(`  (${label} not readable yet — retrying ${i + 1}/${tries})`);
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  }

  const fee = await readWithRetry("perRecipientFee", () => flash.perRecipientFee());
  if (fee !== PER_RECIPIENT_FEE) throw new Error("perRecipientFee mismatch");
  const wiredRegistry = await readWithRetry("recipientRegistry", () =>
    flash.recipientRegistry()
  );
  if (wiredRegistry.toLowerCase() !== registryV2.toLowerCase()) {
    throw new Error("recipientRegistry wiring mismatch — did NOT reuse the live V2");
  }
  // Reverts on the old event-log contract; succeeds only on the D-039 contract.
  await readWithRetry("sentFlashCount(D-039)", () =>
    flash.sentFlashCount(deployer.address)
  );
  console.log("Sanity passed: D-039 getters live, registry reused, fee correct.");

  // --- Persist: stale the old Flash, point at the new one, update the floor ---
  const today = new Date().toISOString().slice(0, 10);
  deployments.stale = deployments.stale || {};
  deployments.stale[`MaktubFlash-${deployments.flashDeployBlock ?? "prev"}`] = {
    address: oldFlash,
    reason:
      "Superseded by the D-039 canonical-state MaktubFlash (#211/#268): payload " +
      "moved to canonical state (FlashRecord/getFlash) + exact sender/recipient " +
      "discovery indexes. Old event-log Flash. Testnet dev — clean cutover, no " +
      "migration (no legacy support / data carried forward). Old contract runs " +
      "forever per D-025; do not use for new activity.",
    deprecatedAt: today,
  };
  deployments.contracts.MaktubFlash = flashAddress;
  deployments.flashDeployBlock = deployBlock;
  deployments.flashDeployBlockNote =
    `MaktubFlash (${flashAddress}) is the D-039 canonical-state Flash (#268), ` +
    `deployed ${today} against the existing RecipientRegistryV2 (${registryV2}). ` +
    "Readers use the canonical getters (getSentFlashes/getReceivedFlashes/getFlash), " +
    "so this floor is informational only — no event-log scan depends on it.";

  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2) + "\n");
  console.log("\nUpdated", DEPLOYMENTS_PATH);
  console.log("RecipientRegistryV2 left UNCHANGED:", deployments.contracts.RecipientRegistryV2);
  console.log("\nNext: node scripts/gen-addresses.mjs   then commit the regenerated files.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
