const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Resuming deploy with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const nonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
  console.log("Starting nonce:", nonce);

  const toWei = (n) => ethers.parseEther(String(n));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

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

  // Already deployed contracts from the partial run
  const CONTRACTS = {
    registry: "0xfF66eEbFCf0C27f682B84500731752AaCAc7BBc9",
    token: "0x068d9176514C868d8fB43CE84A775b63cf223C5D",
    timelock: "0x268602317bF433A88a2cB93e06E458DC4fFC46b9",
    governance: "0xc60EAF688ADf6Cf9b0512De5d06f7341F1993Ddc",
    rewards: "0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba",
    core: "0x46f491eD5A82dA53Eb077aE35C4C5ed328864331",
  };

  const token = await ethers.getContractAt("MktbToken", CONTRACTS.token);

  // Check current state
  const totalSupply = await token.totalSupply();
  console.log("Current total supply:", ethers.formatEther(totalSupply), "MKTB");

  // Estimate gas for remaining mints
  const feeData = await ethers.provider.getFeeData();
  console.log("Gas price:", feeData.gasPrice.toString(), "wei");

  // Remaining: mint 25M to timelock + mint 40M to deployer
  try {
    const gas1 = await token.mint.estimateGas(CONTRACTS.timelock, toWei(25000000));
    console.log("Estimated gas for mint 25M:", gas1.toString());
    const gas2 = await token.mint.estimateGas(deployer.address, toWei(40000000));
    console.log("Estimated gas for mint 40M:", gas2.toString());

    const totalGas = gas1 + gas2;
    const totalCost = totalGas * feeData.gasPrice;
    console.log("Total estimated cost:", ethers.formatEther(totalCost), "ETH");

    if (balance < totalCost) {
      const deficit = totalCost - balance;
      console.log("INSUFFICIENT FUNDS. Need at least", ethers.formatEther(deficit), "more ETH");
      console.log("(with safety margin, send at least", ethers.formatEther(deficit * 2n), "more ETH)");
      return;
    }
  } catch (e) {
    console.log("Gas estimation failed:", e.message);
    console.log("Trying with manual gas limit of 200000...");
  }

  // Execute remaining mints
  console.log("\nMinting 25M to Timelock...");
  await sendAndWait("mint 25M to Timelock",
    token.mint(CONTRACTS.timelock, toWei(25000000), { nonce: currentNonce, gasLimit: 200000 })
  );

  console.log("Minting 40M to Deployer...");
  await sendAndWait("mint 40M to Deployer",
    token.mint(deployer.address, toWei(40000000), { nonce: currentNonce, gasLimit: 200000 })
  );

  // Summary
  console.log("\n========================================");
  console.log("MAKTUB PROTOCOL — DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("RecipientRegistry:", CONTRACTS.registry);
  console.log("MktbToken:        ", CONTRACTS.token);
  console.log("TimelockController:", CONTRACTS.timelock);
  console.log("MktbGovernance:   ", CONTRACTS.governance);
  console.log("ExecutorRewards:  ", CONTRACTS.rewards);
  console.log("MaktubCore:       ", CONTRACTS.core);
  console.log("========================================");

  const finalSupply = await token.totalSupply();
  console.log("Final total supply:", ethers.formatEther(finalSupply), "MKTB");
  console.log("Balance remaining:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Final nonce:", currentNonce);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
