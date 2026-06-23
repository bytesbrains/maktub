// Deploys the ExecutionRelay periphery contract on Base Sepolia, funds it
// with the minimum-stake amount of MKTB, grants it CORE_ROLE on
// ExecutorRewards, and drives its one-shot `initialStake()` so it becomes an
// active executor. After this script completes, the relay is ready to accept
// `executeAndReward(id)` calls from any separately-staked operator wallet.
//
// Usage:
//   npx hardhat run scripts/deploy-execution-relay.js --network baseSepolia
//
// Environment (from .env):
//   PRIVATE_KEY            — deployer key (0x644a…1cE1)
//   BASE_SEPOLIA_RPC_URL   — optional RPC override (defaults to public RPC)
//
// Pre-flight assumptions (verified at runtime; script aborts on failure):
//   1. The deployer still holds DEFAULT_ADMIN_ROLE on ExecutorRewards.
//      (If renounceAdmin() has been called, grantRole() will revert and we
//      cannot complete step 4; redeploy would require governance proposal.)
//   2. The deployer still has >= minimumStake MKTB in their wallet
//      (originally 40M — minus anything already spent on stakes / txns).
//   3. The deployer has enough Base Sepolia ETH for ~5 txns of gas.
//
// Ordering of on-chain actions (single deployer nonce lane, sequential):
//   a. Deploy ExecutionRelay(core, rewards, deployer)
//   b. MktbToken.transfer(relay, minStake)                — fund the relay
//   c. ExecutorRewards.grantRole(CORE_ROLE, relay)        — authorize reward pulls
//   d. ExecutionRelay.initialStake(minStake)              — self-stake, flips isActiveExecutor[relay]=true
//   e. Verify executorRewards.isActiveExecutor(relay) == true
//   f. Persist relay address into deployments/base-sepolia.json

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENTS_PATH = path.join(
  __dirname,
  "..",
  "deployments",
  "base-sepolia.json"
);

const EXPECTED_DEPLOYER = "0x644a7e9D5CACC60Cd41882D114a2339B891B1cE1";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ExecutionRelay with:", deployer.address);

  if (deployer.address.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase()) {
    throw new Error(
      `Signer mismatch: expected ${EXPECTED_DEPLOYER} but got ${deployer.address}. ` +
        `Check PRIVATE_KEY in .env.`
    );
  }

  // ────────────────────────────────────────────────────────
  // Step 0: Pre-flight — load deployments, check balances & roles
  // ────────────────────────────────────────────────────────

  const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"));
  const tokenAddr = deployments.contracts.MktbToken;
  const coreAddr = deployments.contracts.MaktubCore;
  const rewardsAddr = deployments.contracts.ExecutorRewards;

  if (!tokenAddr || !coreAddr || !rewardsAddr) {
    throw new Error(
      "Missing MktbToken / MaktubCore / ExecutorRewards in deployments JSON"
    );
  }

  console.log("\nReferenced contracts:");
  console.log("  MktbToken:       ", tokenAddr);
  console.log("  MaktubCore:      ", coreAddr);
  console.log("  ExecutorRewards: ", rewardsAddr);

  const ethBalance = await ethers.provider.getBalance(deployer.address);
  console.log("\nDeployer ETH balance:", ethers.formatEther(ethBalance), "ETH");
  // Rough floor: deploying a small contract + 4 followup txns on Base
  // Sepolia at current gas costs runs ~0.0003-0.0005 ETH. Warn if lower.
  if (ethBalance < ethers.parseEther("0.0002")) {
    console.warn(
      "  WARNING: ETH balance is low. Deployment may fail mid-flow. Fund the deployer before proceeding."
    );
  }

  const token = await ethers.getContractAt("MktbToken", tokenAddr);
  const rewards = await ethers.getContractAt("ExecutorRewards", rewardsAddr);

  const minStake = await rewards.minimumStake();
  console.log("ExecutorRewards.minimumStake():", ethers.formatEther(minStake), "MKTB");

  const deployerMktb = await token.balanceOf(deployer.address);
  console.log("Deployer MKTB balance:        ", ethers.formatEther(deployerMktb), "MKTB");
  if (deployerMktb < minStake) {
    throw new Error(
      `Deployer has ${ethers.formatEther(deployerMktb)} MKTB but needs at least ` +
        `${ethers.formatEther(minStake)} MKTB to fund the relay's stake.`
    );
  }

  // Confirm DEFAULT_ADMIN_ROLE still lives with deployer (required for
  // grantRole(CORE_ROLE, relay) in step c). If renounceAdmin() has been
  // called, we must abort BEFORE spending gas on the deployment.
  const DEFAULT_ADMIN_ROLE = await rewards.DEFAULT_ADMIN_ROLE();
  const CORE_ROLE = await rewards.CORE_ROLE();
  const deployerHasAdmin = await rewards.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
  if (!deployerHasAdmin) {
    throw new Error(
      "Deployer no longer holds DEFAULT_ADMIN_ROLE on ExecutorRewards. " +
        "Cannot grant CORE_ROLE to the new relay without going through governance. Aborting."
    );
  }
  console.log("Deployer has DEFAULT_ADMIN_ROLE on ExecutorRewards: yes");

  // ────────────────────────────────────────────────────────
  // Nonce lane setup (manual, same pattern as deploy.js)
  // ────────────────────────────────────────────────────────

  let currentNonce = await ethers.provider.getTransactionCount(
    deployer.address,
    "pending"
  );
  console.log("\nStarting nonce:", currentNonce);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function sendAndWait(label, txPromise) {
    console.log(`   [nonce=${currentNonce}] ${label}...`);
    const tx = await txPromise;
    const receipt = await tx.wait(1);
    console.log(
      `   ${label} confirmed in block ${receipt.blockNumber}, gas: ${receipt.gasUsed}`
    );
    currentNonce++;
    await wait(4000);
    return { tx, receipt };
  }

  // ────────────────────────────────────────────────────────
  // Step a: Deploy ExecutionRelay
  // ────────────────────────────────────────────────────────

  console.log("\n1/5 Deploying ExecutionRelay...");
  const ExecutionRelay = await ethers.getContractFactory("ExecutionRelay");
  const relay = await ExecutionRelay.deploy(
    coreAddr,
    rewardsAddr,
    deployer.address,
    { nonce: currentNonce }
  );
  const deployReceipt = await relay.deploymentTransaction().wait(1);
  const relayAddr = await relay.getAddress();
  console.log(
    `   ExecutionRelay deployed at ${relayAddr} ` +
      `(block ${deployReceipt.blockNumber}, gas: ${deployReceipt.gasUsed})`
  );
  currentNonce++;
  await wait(4000);

  // ────────────────────────────────────────────────────────
  // Step b: Transfer minStake MKTB from deployer -> relay
  // ────────────────────────────────────────────────────────

  console.log(
    `\n2/5 Transferring ${ethers.formatEther(minStake)} MKTB to the relay...`
  );
  await sendAndWait(
    "token.transfer(relay, minStake)",
    token.transfer(relayAddr, minStake, { nonce: currentNonce })
  );

  const relayMktb = await token.balanceOf(relayAddr);
  if (relayMktb < minStake) {
    throw new Error(
      `Relay balance after transfer is ${ethers.formatEther(relayMktb)} MKTB, ` +
        `expected >= ${ethers.formatEther(minStake)} MKTB.`
    );
  }
  console.log("   Relay MKTB balance:", ethers.formatEther(relayMktb), "MKTB");

  // ────────────────────────────────────────────────────────
  // Step c: Grant CORE_ROLE on ExecutorRewards to the relay
  // ────────────────────────────────────────────────────────

  console.log("\n3/5 Granting CORE_ROLE on ExecutorRewards to the relay...");
  await sendAndWait(
    "rewards.grantRole(CORE_ROLE, relay)",
    rewards.grantRole(CORE_ROLE, relayAddr, { nonce: currentNonce })
  );

  const relayHasCore = await rewards.hasRole(CORE_ROLE, relayAddr);
  if (!relayHasCore) {
    throw new Error("CORE_ROLE grant did not take effect on-chain. Aborting.");
  }
  console.log("   Relay has CORE_ROLE: yes");

  // ────────────────────────────────────────────────────────
  // Step d: Relay self-stakes via initialStake()
  // ────────────────────────────────────────────────────────

  console.log(
    `\n4/5 Calling ExecutionRelay.initialStake(${ethers.formatEther(minStake)} MKTB)...`
  );
  const { receipt: stakeReceipt } = await sendAndWait(
    "relay.initialStake(minStake)",
    relay.initialStake(minStake, { nonce: currentNonce })
  );
  const stakeTxHash = stakeReceipt.hash;

  // ────────────────────────────────────────────────────────
  // Step e: Verify the relay is now an active executor
  // ────────────────────────────────────────────────────────

  console.log("\n5/5 Verifying relay is an active executor...");
  const isActive = await rewards.isActiveExecutor(relayAddr);
  const relayStakeOnRewards = await rewards.stakes(relayAddr);
  console.log("   isActiveExecutor(relay):", isActive);
  console.log(
    "   ExecutorRewards.stakes(relay):",
    ethers.formatEther(relayStakeOnRewards),
    "MKTB"
  );
  const relayStakedFlag = await relay.staked();
  console.log("   ExecutionRelay.staked():", relayStakedFlag);

  if (!isActive || !relayStakedFlag) {
    throw new Error(
      "Relay did not become an active executor. Check the `initialStake` tx logs."
    );
  }

  // ────────────────────────────────────────────────────────
  // Step f: Persist to deployments/base-sepolia.json
  // ────────────────────────────────────────────────────────

  const previousRelayAddr = deployments.contracts.ExecutionRelay;
  deployments.contracts.ExecutionRelay = relayAddr;
  if (previousRelayAddr && previousRelayAddr !== relayAddr) {
    deployments.stale = deployments.stale || {};
    deployments.stale.ExecutionRelay = {
      address: previousRelayAddr,
      reason:
        "Superseded by a fresh ExecutionRelay deployment. Older relay retains " +
        "CORE_ROLE until explicitly revoked, but should no longer be used.",
      deprecatedAt: new Date().toISOString().slice(0, 10),
    };
  }
  fs.writeFileSync(
    DEPLOYMENTS_PATH,
    JSON.stringify(deployments, null, 2) + "\n"
  );
  console.log("\nUpdated", DEPLOYMENTS_PATH);

  // ────────────────────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────────────────────

  const finalEth = await ethers.provider.getBalance(deployer.address);
  const finalMktb = await token.balanceOf(deployer.address);

  console.log("\n========================================");
  console.log("EXECUTION RELAY — DEPLOYED ON BASE SEPOLIA");
  console.log("========================================");
  console.log("ExecutionRelay:    ", relayAddr);
  console.log("MaktubCore (wired):", coreAddr);
  console.log("ExecutorRewards:   ", rewardsAddr);
  console.log("Stake tx hash:     ", stakeTxHash);
  console.log("Stake amount:      ", ethers.formatEther(minStake), "MKTB");
  console.log("Relay active:      ", isActive);
  console.log("----------------------------------------");
  console.log("Deployer ETH left: ", ethers.formatEther(finalEth), "ETH");
  console.log("Deployer MKTB left:", ethers.formatEther(finalMktb), "MKTB");
  console.log("Final nonce:       ", currentNonce);
  console.log("========================================");

  console.log("\nNext step — any staked executor wallet can now call:");
  console.log(
    `  ExecutionRelay(${relayAddr}).executeAndReward(heartbeatId)`
  );
  console.log(
    "This will atomically:\n" +
      "  1. MaktubCore.execute(id)                (msg.sender = relay; relay is staked)\n" +
      "  2. ExecutorRewards.distributeReward(operator, id)  (operator = original caller)\n" +
      "If either call reverts, the whole tx reverts. The operator must also be a\n" +
      "staked active executor for step 2 to succeed."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
