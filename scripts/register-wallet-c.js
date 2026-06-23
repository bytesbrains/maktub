/*
 * Maktub Protocol — Register Wallet C as a Recipient on Base Sepolia
 *
 *   Wallet C (Second Recipient) — test wallet used in multi-recipient flows.
 *
 * Standalone node script. Uses ethers.js so Wallet C signs its own
 * register(prePublicKey) transaction against RecipientRegistry.
 *
 *   node scripts/register-wallet-c.js
 */

require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ---------- configuration ----------
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

// Private key is loaded from the environment so it never lives in source.
// Set WALLET_C_PRIVATE_KEY in your local .env file (not committed to git).
function requireEnvKey(name) {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    console.error(
      `\nMissing ${name} in .env file.\n` +
        `Add it like:\n` +
        `  WALLET_A_PRIVATE_KEY=0x40ff...\n` +
        `  WALLET_B_PRIVATE_KEY=0xe6c6...\n` +
        `  WALLET_C_PRIVATE_KEY=0xbf6b...\n` +
        `(These are testnet-only test wallets — never use real funds here.)\n`
    );
    process.exit(1);
  }
  return v.trim();
}

const WALLET_C = {
  address: "0xdC69998b3a73D690d7EC4c25D74B7a46390744Bb",
  privateKey: requireEnvKey("WALLET_C_PRIVATE_KEY"),
  role: "Second Recipient",
};

// Minimum balance required for a single register() call (~0.00001 ETH is
// enough for gas on Base Sepolia; we ask for at least 0.00001).
const MIN_C_ETH = ethers.parseEther("0.00001");

// ---------- load deployment + ABIs ----------
const DEPLOY_FILE = path.join(
  __dirname,
  "..",
  "deployments",
  "base-sepolia.json"
);
const deployment = JSON.parse(fs.readFileSync(DEPLOY_FILE, "utf8"));

const ART_ROOT = path.join(__dirname, "..", "artifacts", "contracts", "v3");
function loadAbi(subdir, name) {
  const p = path.join(ART_ROOT, subdir, `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8")).abi;
}
const registryAbi = loadAbi("core", "RecipientRegistry");

// ---------- helpers ----------
const fmtEth = (w) => `${ethers.formatEther(w)} ETH`;

function hr(title) {
  console.log("\n" + "=".repeat(64));
  if (title) console.log(title);
  if (title) console.log("=".repeat(64));
}

async function main() {
  hr("MAKTUB PROTOCOL — REGISTER WALLET C (Base Sepolia)");

  const provider = new ethers.JsonRpcProvider(RPC_URL, {
    name: "base-sepolia",
    chainId: 84532,
  });
  const walletC = new ethers.Wallet(WALLET_C.privateKey, provider);

  console.log(`RPC:                ${RPC_URL}`);
  console.log(`Chain ID:           ${deployment.chainId}`);
  console.log(`RecipientRegistry:  ${deployment.contracts.RecipientRegistry}`);
  console.log(`Wallet C (${WALLET_C.role}): ${WALLET_C.address}`);

  // ----------------------------------------------------
  // STEP 0: balance & faucet check
  // ----------------------------------------------------
  hr("STEP 0 — Balance check");
  const balC = await provider.getBalance(WALLET_C.address);
  console.log(`Wallet C balance: ${fmtEth(balC)}`);

  if (balC < MIN_C_ETH) {
    const need = MIN_C_ETH - balC;
    console.log(
      `\n[FAUCET NEEDED] Wallet C is short by ${fmtEth(need)}.` +
        `\n  Wallet C needs at least ${fmtEth(MIN_C_ETH)} for one register() call.` +
        `\n  Send ~0.00005 ETH to ${WALLET_C.address}` +
        `\n  Base Sepolia faucets:` +
        `\n    - https://www.alchemy.com/faucets/base-sepolia` +
        `\n    - https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet` +
        `\n    - https://faucet.quicknode.com/base/sepolia`
    );
    console.log(
      "\nAborting before any on-chain actions. Top up Wallet C and re-run."
    );
    process.exit(1);
  }
  console.log("Wallet C funded. Proceeding.");

  // ----------------------------------------------------
  // Contract handle
  // ----------------------------------------------------
  const registryC = new ethers.Contract(
    deployment.contracts.RecipientRegistry,
    registryAbi,
    walletC
  );

  // ----------------------------------------------------
  // STEP 1: register Wallet C as a recipient
  // ----------------------------------------------------
  hr("STEP 1 — Wallet C registers as recipient");
  const alreadyRegistered = await registryC.isRegistered(WALLET_C.address);
  let registerTxHash = null;
  if (alreadyRegistered) {
    console.log("Wallet C is already registered. Skipping registration.");
  } else {
    // Dummy PRE public key — 64 random bytes. In production this is the real
    // recipient-side proxy re-encryption public key.
    const dummyPreKey = ethers.hexlify(ethers.randomBytes(64));
    console.log(`PRE pubkey (dummy, 64 bytes): ${dummyPreKey}`);
    const tx = await registryC.register(dummyPreKey);
    console.log(`  tx sent: ${tx.hash}`);
    const rcpt = await tx.wait(1);
    registerTxHash = rcpt.hash;
    console.log(
      `  mined in block ${rcpt.blockNumber}, gas used ${rcpt.gasUsed}`
    );
  }

  // ----------------------------------------------------
  // STEP 2: verify registration
  // ----------------------------------------------------
  hr("STEP 2 — Verify registration");
  // Public RPCs behind a load balancer may briefly return stale state from a
  // node that hasn't caught up to the block our tx landed in. Retry a few times.
  let isReg = false;
  for (let attempt = 1; attempt <= 6; attempt++) {
    isReg = await registryC.isRegistered(WALLET_C.address);
    if (isReg) break;
    console.log(`  attempt ${attempt}: isRegistered=false, retrying in 3s...`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(`isRegistered(Wallet C): ${isReg}`);
  if (!isReg) {
    console.error("Registration verification FAILED — isRegistered returned false.");
    process.exit(2);
  }

  // ----------------------------------------------------
  // Final balance
  // ----------------------------------------------------
  hr("STEP 3 — Final balance");
  const balCFinal = await provider.getBalance(WALLET_C.address);
  console.log(
    `Wallet C: ${fmtEth(balC)} -> ${fmtEth(balCFinal)} (spent ${fmtEth(
      balC - balCFinal
    )})`
  );

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  hr("SUMMARY");
  console.log(`Wallet C:                ${WALLET_C.address}`);
  console.log(`RecipientRegistry:       ${deployment.contracts.RecipientRegistry}`);
  console.log(`isRegistered(Wallet C):  ${isReg}`);
  if (registerTxHash) {
    console.log(`register() tx hash:      ${registerTxHash}`);
  } else {
    console.log(`register() tx hash:      (skipped — already registered)`);
  }
  console.log("");
  console.log("It is written.");
}

main().catch((err) => {
  console.error("\n[ERROR]", err);
  process.exit(1);
});
