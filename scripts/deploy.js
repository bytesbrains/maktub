const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const nonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
  console.log("Starting nonce:", nonce);

  const toWei = (n) => ethers.parseEther(String(n));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // Track nonce manually
  let currentNonce = nonce;

  async function sendAndWait(label, txPromise) {
    console.log(`   [nonce=${currentNonce}] ${label}...`);
    const tx = await txPromise;
    const receipt = await tx.wait(1);
    console.log(`   ${label} confirmed in block ${receipt.blockNumber}, gas: ${receipt.gasUsed}`);
    currentNonce++;
    await wait(4000);
    return receipt;
  }

  async function deployContract(label, factory, args) {
    console.log(`   [nonce=${currentNonce}] Deploying ${label}...`);
    const contract = await factory.deploy(...args, { nonce: currentNonce });
    const receipt = await contract.deploymentTransaction().wait(1);
    const addr = await contract.getAddress();
    console.log(`   ${label} deployed at ${addr} (block ${receipt.blockNumber}, gas: ${receipt.gasUsed})`);
    currentNonce++;
    await wait(4000);
    return contract;
  }

  // ============================================
  // Previously deployed contracts (nonces 8-10)
  // Re-deploy everything fresh to keep it clean
  // ============================================

  // 1. RecipientRegistry
  console.log("\n1/6 Deploying RecipientRegistry...");
  const RecipientRegistry = await ethers.getContractFactory("RecipientRegistry");
  const registry = await deployContract("RecipientRegistry", RecipientRegistry, []);

  // 2. MktbToken
  console.log("\n2/6 Deploying MktbToken...");
  const MktbToken = await ethers.getContractFactory("MktbToken");
  const token = await deployContract("MktbToken", MktbToken, [deployer.address]);

  // 3. TimelockController (48h delay)
  console.log("\n3/6 Deploying TimelockController...");
  const TimelockController = await ethers.getContractFactory("TimelockController");
  const timelock = await deployContract("TimelockController", TimelockController, [
    172800n, // 48 hours
    [],      // proposers (added later)
    [],      // executors (added later)
    deployer.address // admin
  ]);

  // 4. MktbGovernance
  console.log("\n4/6 Deploying MktbGovernance...");
  const MktbGovernance = await ethers.getContractFactory("MktbGovernance");
  const governance = await deployContract("MktbGovernance", MktbGovernance, [
    await token.getAddress(),
    await timelock.getAddress()
  ]);

  // 5. ExecutorRewards
  console.log("\n5/6 Deploying ExecutorRewards...");
  const ExecutorRewards = await ethers.getContractFactory("ExecutorRewards");
  const rewards = await deployContract("ExecutorRewards", ExecutorRewards, [
    await token.getAddress(),
    toWei(1000),  // min stake: 1000 MKTB
    toWei(100),   // reward per execution: 100 MKTB
    deployer.address,           // admin
    await timelock.getAddress()  // governance
  ]);

  // 6. MaktubCore
  console.log("\n6/6 Deploying MaktubCore...");
  // D-023 committed wei targets: base = 124 µETH, perAdditional = 40 µETH (base/3).
  // Fee curve (D-022): creationFee = base + (recipients.length - 1) * perAdditional.
  const baseFee = 124000000000000n;
  const perAdditionalFee = 40000000000000n;
  const MaktubCore = await ethers.getContractFactory("MaktubCore");
  const core = await deployContract("MaktubCore", MaktubCore, [
    baseFee,
    perAdditionalFee,
    deployer.address, // fee receiver
    await registry.getAddress(),
    await rewards.getAddress()
  ]);

  // ============================================
  // Role Setup (sequential with waits)
  // ============================================
  console.log("\nSetting up roles...");

  const coreAddr = await core.getAddress();
  const govAddr = await governance.getAddress();

  // Set MaktubCore on ExecutorRewards (circular dep resolution)
  await sendAndWait("setMaktubCore", rewards.setMaktubCore(coreAddr, { nonce: currentNonce }));

  // Grant CORE_ROLE to MaktubCore on ExecutorRewards
  const CORE_ROLE = await rewards.CORE_ROLE();
  await sendAndWait("grantRole CORE_ROLE", rewards.grantRole(CORE_ROLE, coreAddr, { nonce: currentNonce }));

  // Grant governance roles on TimelockController
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  await sendAndWait("grantRole PROPOSER_ROLE", timelock.grantRole(PROPOSER_ROLE, govAddr, { nonce: currentNonce }));

  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  await sendAndWait("grantRole EXECUTOR_ROLE", timelock.grantRole(EXECUTOR_ROLE, govAddr, { nonce: currentNonce }));

  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  await sendAndWait("grantRole CANCELLER_ROLE", timelock.grantRole(CANCELLER_ROLE, govAddr, { nonce: currentNonce }));

  // ============================================
  // Token Distribution (sequential with waits)
  // ============================================
  console.log("\nDistributing 100M MKTB...");

  const rewardsAddr = await rewards.getAddress();
  await sendAndWait("mint 35M to ExecutorRewards", token.mint(rewardsAddr, toWei(35000000), { nonce: currentNonce }));

  const timelockAddr = await timelock.getAddress();
  await sendAndWait("mint 25M to Timelock", token.mint(timelockAddr, toWei(25000000), { nonce: currentNonce }));

  await sendAndWait("mint 40M to deployer", token.mint(deployer.address, toWei(40000000), { nonce: currentNonce }));

  // ============================================
  // Summary
  // ============================================
  console.log("\n========================================");
  console.log("MAKTUB PROTOCOL — DEPLOYED ON BASE SEPOLIA");
  console.log("========================================");
  console.log("RecipientRegistry:", await registry.getAddress());
  console.log("MktbToken:        ", await token.getAddress());
  console.log("TimelockController:", await timelock.getAddress());
  console.log("MktbGovernance:   ", await governance.getAddress());
  console.log("ExecutorRewards:  ", await rewards.getAddress());
  console.log("MaktubCore:       ", await core.getAddress());
  console.log("========================================");
  console.log("Balance remaining:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Final nonce:", currentNonce);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
