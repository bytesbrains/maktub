/*
 * Maktub Protocol — Two-Wallet End-to-End Test on Base Sepolia
 *
 *   Wallet A (Owner — "The Parent")   creates a heartbeat
 *   Wallet B (Recipient — "The Child") registers + will receive the payload
 *
 * This is a standalone node script (not run via hardhat). It uses ethers.js
 * directly so both wallets can sign transactions independently.
 *
 *   node scripts/two-wallet-test.js
 *
 * The sequential phases live in scripts/two-wallet/ (setup, register, create,
 * verify); this file wires up the context and runs them in order.
 */

require("dotenv").config();
const { ethers } = require("ethers");
const {
  RPC_URL,
  requireEnvKey,
  loadDeployment,
  loadAbi,
  hr,
} = require("./two-wallet/helpers.js");
const { step0BalanceCheck } = require("./two-wallet/setup.js");
const { step1Register } = require("./two-wallet/register.js");
const { step2CreateHeartbeat } = require("./two-wallet/create.js");
const {
  step3CheckIn,
  step4ReadBack,
  step5FinalBalances,
  printSummary,
} = require("./two-wallet/verify.js");

const WALLET_A = {
  address: "0x940C0E0a07C9B867E6ef1F081Ad882db5D269ff7",
  privateKey: requireEnvKey("WALLET_A_PRIVATE_KEY"),
  role: "Owner — The Parent",
};
const WALLET_B = {
  address: "0x21F0A209B1435A0b87fD8bE2fBA086Ba0E59D1EC",
  privateKey: requireEnvKey("WALLET_B_PRIVATE_KEY"),
  role: "Recipient — The Child",
};

const deployment = loadDeployment();
const registryAbi = loadAbi("core", "RecipientRegistry");
const coreAbi = loadAbi("core", "MaktubCore");

async function main() {
  hr("MAKTUB PROTOCOL — TWO-WALLET END-TO-END TEST (Base Sepolia)");

  const provider = new ethers.JsonRpcProvider(RPC_URL, {
    name: "base-sepolia",
    chainId: 84532,
  });
  const walletA = new ethers.Wallet(WALLET_A.privateKey, provider);
  const walletB = new ethers.Wallet(WALLET_B.privateKey, provider);

  console.log(`RPC:                ${RPC_URL}`);
  console.log(`Chain ID:           ${deployment.chainId}`);
  console.log(`RecipientRegistry:  ${deployment.contracts.RecipientRegistry}`);
  console.log(`MaktubCore:         ${deployment.contracts.MaktubCore}`);
  console.log(`Wallet A (${WALLET_A.role}): ${WALLET_A.address}`);
  console.log(`Wallet B (${WALLET_B.role}): ${WALLET_B.address}`);

  // STEP 0: balances & faucet check
  const { balA, balB } = await step0BalanceCheck({ provider, WALLET_A, WALLET_B });

  // Contract handles
  const registryA = new ethers.Contract(
    deployment.contracts.RecipientRegistry,
    registryAbi,
    walletA
  );
  const registryB = new ethers.Contract(
    deployment.contracts.RecipientRegistry,
    registryAbi,
    walletB
  );
  const coreA = new ethers.Contract(
    deployment.contracts.MaktubCore,
    coreAbi,
    walletA
  );

  const txHashes = {};

  // STEP 1: Wallet B registers as a recipient (ECIES key)
  const { eciesKeypair } = await step1Register({ WALLET_B, registryB, txHashes });

  // STEP 2: Wallet A creates the heartbeat
  const { heartbeatId } = await step2CreateHeartbeat({
    WALLET_B,
    registryA,
    coreA,
    txHashes,
  });

  // STEP 3: Wallet A checks in once
  await step3CheckIn({ coreA, heartbeatId, txHashes });

  // STEP 4: Read-back + Wallet B decrypts the payload
  const { hb, finalRemaining, minutes } = await step4ReadBack({
    WALLET_B,
    coreA,
    heartbeatId,
    eciesKeypair,
  });

  // STEP 5: Final balances
  await step5FinalBalances({ provider, WALLET_A, WALLET_B, balA, balB });

  // Summary
  printSummary({ heartbeatId, hb, finalRemaining, minutes, txHashes });
}

main().catch((err) => {
  console.error("\n[ERROR]", err);
  process.exit(1);
});
