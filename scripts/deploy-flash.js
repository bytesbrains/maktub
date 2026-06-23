// Deploys the Maktub Flash citizen stack on Base Sepolia:
//   1. RecipientRegistryV2 — typed key slots (encPubKey + ratchetPubKey),
//      with the immutable v1 fall-through pointer (D-023 schema).
//   2. MaktubFlash — instant-triggered, fire-and-forget delivery, pure-linear
//      per-recipient fee (D-022), 100% fee flow to Foundation (D-024).
//
// Usage:
//   npx hardhat run scripts/deploy-flash.js --network baseSepolia
//
// Environment (from .env):
//   PRIVATE_KEY            — deployer key
//   BASE_SEPOLIA_RPC_URL   — optional RPC override (defaults to public RPC)
//
// Pre-flight assumptions (verified at runtime; script aborts on failure):
//   1. deployments/base-sepolia.json carries a live RecipientRegistry (v1)
//      address — V2 wires its fall-through to it.
//   2. The deployer has enough Base Sepolia ETH for 2 contract deploys.
//
// Both contracts are fully immutable on deploy: no roles to grant, no
// post-deploy wiring, no one-shot setters. After this script completes the
// Flash citizen is live; addresses are persisted into
// deployments/base-sepolia.json under contracts.{RecipientRegistryV2,MaktubFlash}.

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENTS_PATH = path.join(
  __dirname,
  "..",
  "deployments",
  "base-sepolia.json"
);

// D-023 committed wei target: perRecipient = 5 µETH (Beat-base / 25).
const PER_RECIPIENT_FEE = 5_000_000_000_000n;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Flash stack with:", deployer.address);

  const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"));
  const v1Address = deployments.contracts.RecipientRegistry;
  if (!v1Address) {
    throw new Error(
      "No RecipientRegistry (v1) address in deployments/base-sepolia.json — " +
        "deploy the Beat stack first (scripts/deploy.js)."
    );
  }
  console.log("RecipientRegistry v1 (fall-through):", v1Address);

  // 1. RecipientRegistryV2
  console.log("\n1/2 Deploying RecipientRegistryV2...");
  const V2 = await ethers.getContractFactory("RecipientRegistryV2");
  const registryV2 = await V2.deploy(v1Address);
  await registryV2.waitForDeployment();
  const v2Address = await registryV2.getAddress();
  console.log("RecipientRegistryV2:", v2Address);

  // 2. MaktubFlash — fee receiver defaults to the deployer (testnet pattern)
  //    but can be overridden via FEE_RECEIVER for deploys where the
  //    Foundation address is not the deployer EOA. Immutable after this line.
  const feeReceiver = process.env.FEE_RECEIVER || deployer.address;
  console.log("\n2/2 Deploying MaktubFlash...");
  console.log("Fee receiver (immutable):", feeReceiver);
  const Flash = await ethers.getContractFactory("MaktubFlash");
  const flash = await Flash.deploy(
    PER_RECIPIENT_FEE,
    feeReceiver,
    v2Address
  );
  await flash.waitForDeployment();
  const flashAddress = await flash.getAddress();
  console.log("MaktubFlash:", flashAddress);

  // 3. Sanity checks
  if ((await registryV2.v1()) !== ethers.getAddress(v1Address)) {
    throw new Error("V2 fall-through pointer mismatch");
  }
  if ((await flash.perRecipientFee()) !== PER_RECIPIENT_FEE) {
    throw new Error("perRecipientFee mismatch");
  }
  console.log("\nSanity checks passed.");

  // 4. Persist addresses
  deployments.contracts.RecipientRegistryV2 = v2Address;
  deployments.contracts.MaktubFlash = flashAddress;
  deployments.flashPerRecipientFee = PER_RECIPIENT_FEE.toString();
  fs.writeFileSync(
    DEPLOYMENTS_PATH,
    JSON.stringify(deployments, null, 2) + "\n"
  );
  console.log("Addresses persisted to", DEPLOYMENTS_PATH);

  console.log("\nFlash citizen is live:");
  console.log("  RecipientRegistryV2:", v2Address);
  console.log("  MaktubFlash:       ", flashAddress);
  console.log("  perRecipientFee:   ", ethers.formatEther(PER_RECIPIENT_FEE), "ETH");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
