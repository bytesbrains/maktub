const { ethers } = require("hardhat");
async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const nonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
  console.log("Address:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  console.log("Balance (wei):", balance.toString());
  console.log("Current nonce:", nonce);
}
main().catch(console.error);
