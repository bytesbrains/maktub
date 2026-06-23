/*
 * Two-Wallet E2E Test — STEP 0: balance / faucet check.
 *
 * Body copied verbatim from scripts/two-wallet-test.js.
 */

const {
  MIN_A_ETH,
  MIN_B_ETH,
  fmtEth,
  hr,
} = require("./helpers.js");

async function step0BalanceCheck({ provider, WALLET_A, WALLET_B }) {
  // ----------------------------------------------------
  // STEP 0: balances & faucet check
  // ----------------------------------------------------
  hr("STEP 0 — Balance check");
  const balA = await provider.getBalance(WALLET_A.address);
  const balB = await provider.getBalance(WALLET_B.address);
  console.log(`Wallet A balance: ${fmtEth(balA)}`);
  console.log(`Wallet B balance: ${fmtEth(balB)}`);

  let abort = false;
  if (balA < MIN_A_ETH) {
    const need = MIN_A_ETH - balA;
    console.log(
      `\n[FAUCET NEEDED] Wallet A is short by ${fmtEth(need)}.` +
        `\n  Send at least ${fmtEth(MIN_A_ETH)} to ${WALLET_A.address}` +
        `\n  Base Sepolia faucets:` +
        `\n    - https://www.alchemy.com/faucets/base-sepolia` +
        `\n    - https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet` +
        `\n    - https://faucet.quicknode.com/base/sepolia`
    );
    abort = true;
  }
  if (balB < MIN_B_ETH) {
    const need = MIN_B_ETH - balB;
    console.log(
      `\n[FAUCET NEEDED] Wallet B has no gas (short by ${fmtEth(need)}).` +
        `\n  Wallet B only needs gas for one register() call (~0.00001 ETH).` +
        `\n  Send ~0.00005 ETH to ${WALLET_B.address}`
    );
    abort = true;
  }
  if (abort) {
    console.log(
      "\nAborting before any on-chain actions. Top up the wallets and re-run."
    );
    process.exit(1);
  }
  console.log("Both wallets funded. Proceeding.");

  return { balA, balB };
}

module.exports = { step0BalanceCheck };
