/*
 * Maktub Protocol — Two-Wallet End-to-End Test: shared helpers + config.
 *
 * Side-effect-free utilities and configuration constants extracted from
 * scripts/two-wallet-test.js. Safe to require from a test (loadAbi/loadDeployment
 * read files only when called).
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ---------- configuration ----------
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

const PAYLOAD_TEXT =
  "Dear child, my seed phrase is: apple banana cherry. My password manager: mymaster123. Love, Mom.";
const INTERVAL_SECONDS = 3600n; // 1 hour (contract minimum)
const CREATION_FEE = 124_000_000_000_000n; // 0.000124 ETH

// Minimum balances we want before starting.
// On Base Sepolia gas is cheap (~6 gwei). createHeartbeat uses ~223k gas
// which at current prices costs ~0.0000025 ETH. The creation fee itself
// is 0.000124 ETH. checkIn is ~40k gas. So a safe floor is 0.00015 ETH.
// Wallet B only needs gas for one register() call (~0.00001 ETH is enough).
const MIN_A_ETH = ethers.parseEther("0.00015");
const MIN_B_ETH = ethers.parseEther("0.00001");

// Private keys are loaded from the environment so they never live in source.
// Set WALLET_A_PRIVATE_KEY and WALLET_B_PRIVATE_KEY in your local .env file
// (not committed to git).
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

// ---------- load deployment + ABIs ----------
const DEPLOY_FILE = path.join(
  __dirname,
  "..",
  "..",
  "deployments",
  "base-sepolia.json"
);

function loadDeployment() {
  return JSON.parse(fs.readFileSync(DEPLOY_FILE, "utf8"));
}

const ART_ROOT = path.join(__dirname, "..", "..", "artifacts", "contracts", "v3");
function loadAbi(subdir, name) {
  const p = path.join(ART_ROOT, subdir, `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8")).abi;
}

// ---------- helpers ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtEth = (w) => `${ethers.formatEther(w)} ETH`;
const short = (addr) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

function hr(title) {
  console.log("\n" + "=".repeat(64));
  if (title) console.log(title);
  if (title) console.log("=".repeat(64));
}

module.exports = {
  RPC_URL,
  PAYLOAD_TEXT,
  INTERVAL_SECONDS,
  CREATION_FEE,
  MIN_A_ETH,
  MIN_B_ETH,
  requireEnvKey,
  DEPLOY_FILE,
  loadDeployment,
  ART_ROOT,
  loadAbi,
  wait,
  fmtEth,
  short,
  hr,
};
