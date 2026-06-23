// Redeploys MktbGovernance only, then rotates the timelock roles from the old
// governance address to the new one. Used to fix the Base L2 block-count
// calibration bug (the original deploy used Ethereum-mainnet 12s block counts:
// votingDelay=7200, votingPeriod=50400, which on Base's ~2s blocks produced
// 1/6 of intended durations). The new contract bakes in 43,200 / 302,400.
//
// Usage: npx hardhat run scripts/redeploy-governance.js --network baseSepolia
//
// Pre-flight: the deployer signer must still hold DEFAULT_ADMIN_ROLE on the
// TimelockController (it was granted at the original deploy and is needed to
// rotate PROPOSER / EXECUTOR / CANCELLER roles).

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENTS_PATH = path.join(__dirname, "..", "deployments", "base-sepolia.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Redeploying MktbGovernance with:", deployer.address);

  const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"));
  const tokenAddr = deployments.contracts.MktbToken;
  const timelockAddr = deployments.contracts.TimelockController;
  const oldGovAddr = deployments.stale?.MktbGovernance?.address;

  if (!tokenAddr || !timelockAddr) {
    throw new Error("Missing MktbToken or TimelockController in deployments JSON");
  }
  if (!oldGovAddr) {
    throw new Error("Missing stale.MktbGovernance.address in deployments JSON");
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1. Deploy new MktbGovernance with corrected Base L2 block counts
  console.log("\n1/2 Deploying new MktbGovernance...");
  const MktbGovernance = await ethers.getContractFactory("MktbGovernance");
  const governance = await MktbGovernance.deploy(tokenAddr, timelockAddr);
  await governance.deploymentTransaction().wait(1);
  const newGovAddr = await governance.getAddress();
  console.log("   New MktbGovernance:", newGovAddr);

  // Sanity-check the parameters we just baked in
  const vd = await governance.votingDelay();
  const vp = await governance.votingPeriod();
  console.log("   votingDelay (blocks) :", vd.toString(), "(expect 43200)");
  console.log("   votingPeriod (blocks):", vp.toString(), "(expect 302400)");
  if (vd !== 43_200n || vp !== 302_400n) {
    throw new Error("Block-count sanity check failed; aborting role rotation.");
  }

  await wait(4000);

  // 2. Rotate timelock roles
  console.log("\n2/2 Rotating timelock roles from old governance to new...");
  const timelock = await ethers.getContractAt("TimelockController", timelockAddr);

  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();

  async function send(label, txPromise) {
    console.log("   ", label);
    const tx = await txPromise;
    await tx.wait(1);
    await wait(3000);
  }

  // Grant to new first (so there's no governance-less window if revoke succeeds
  // but grant fails for some reason).
  await send("grant PROPOSER_ROLE -> new", timelock.grantRole(PROPOSER_ROLE, newGovAddr));
  await send("grant EXECUTOR_ROLE -> new", timelock.grantRole(EXECUTOR_ROLE, newGovAddr));
  await send("grant CANCELLER_ROLE -> new", timelock.grantRole(CANCELLER_ROLE, newGovAddr));

  await send("revoke PROPOSER_ROLE <- old", timelock.revokeRole(PROPOSER_ROLE, oldGovAddr));
  await send("revoke EXECUTOR_ROLE <- old", timelock.revokeRole(EXECUTOR_ROLE, oldGovAddr));
  await send("revoke CANCELLER_ROLE <- old", timelock.revokeRole(CANCELLER_ROLE, oldGovAddr));

  // 3. Persist the new address; mark old as stale.
  deployments.contracts.MktbGovernance = newGovAddr;
  deployments.stale = deployments.stale || {};
  deployments.stale.MktbGovernance = {
    address: oldGovAddr,
    reason:
      "Deployed with Ethereum-mainnet (12s) block counts (votingDelay=7200, votingPeriod=50400). On Base L2 (~2s blocks) this produced 1/6 of intended wall-clock durations. Redeployed with corrected Base L2 values (votingDelay=43200, votingPeriod=302400). Do not use this address.",
    deprecatedAt: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2) + "\n");
  console.log("\nUpdated", DEPLOYMENTS_PATH);

  console.log("\n========================================");
  console.log("MktbGovernance redeployed:", newGovAddr);
  console.log("Old (stale) address:      ", oldGovAddr);
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
