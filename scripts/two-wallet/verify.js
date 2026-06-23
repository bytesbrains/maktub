/*
 * Two-Wallet E2E Test — STEP 3 (check-in), STEP 4 (read-back + decrypt),
 * STEP 5 (final balances), and SUMMARY.
 *
 * Bodies copied verbatim from scripts/two-wallet-test.js.
 */

const { decryptBundleAt } = require("../../sdk/dist/crypto/ecies.js");
const {
  PAYLOAD_TEXT,
  INTERVAL_SECONDS,
  wait,
  fmtEth,
  hr,
} = require("./helpers.js");

async function step3CheckIn({ coreA, heartbeatId, txHashes }) {
  // ----------------------------------------------------
  // STEP 3: Wallet A checks in once (verify timer resets, count++)
  // ----------------------------------------------------
  hr("STEP 3 — Wallet A performs one check-in");
  const hbBefore = await coreA.getHeartbeat(heartbeatId);
  const remainingBefore = await coreA.timeRemaining(heartbeatId);
  console.log(
    `Before check-in: checkInCount=${hbBefore.checkInCount}, timeRemaining=${remainingBefore}s`
  );

  // Sleep briefly so we can visibly see the timer reset upward.
  await wait(4000);

  const txCheck = await coreA.checkIn(heartbeatId);
  console.log(`  tx sent: ${txCheck.hash}`);
  const rcptCheck = await txCheck.wait(1);
  txHashes.checkIn = rcptCheck.hash;
  console.log(
    `  mined in block ${rcptCheck.blockNumber}, gas used ${rcptCheck.gasUsed}`
  );

  const hbAfter = await coreA.getHeartbeat(heartbeatId);
  const remainingAfter = await coreA.timeRemaining(heartbeatId);
  console.log(
    `After  check-in: checkInCount=${hbAfter.checkInCount}, timeRemaining=${remainingAfter}s`
  );
  const timerReset = remainingAfter >= remainingBefore;
  const countIncremented = hbAfter.checkInCount === hbBefore.checkInCount + 1n;
  console.log(`Timer reset: ${timerReset}`);
  console.log(`checkInCount incremented by 1: ${countIncremented}`);
}

async function step4ReadBack({ WALLET_B, coreA, heartbeatId, eciesKeypair }) {
  // ----------------------------------------------------
  // STEP 4: Read-back / verification
  // ----------------------------------------------------
  hr("STEP 4 — Read-back + Wallet B decrypts the payload");
  const hb = await coreA.getHeartbeat(heartbeatId);
  const finalRemaining = await coreA.timeRemaining(heartbeatId);
  const minutes = Number(finalRemaining) / 60;

  // Convert on-chain payload (hex string) to Uint8Array for the decrypter.
  const payloadHex = hb.payload;
  const payloadU8 = Uint8Array.from(
    Buffer.from(payloadHex.slice(2), "hex")
  );

  // Wallet B finds its index in hb.recipients and decrypts its blob.
  const myIndex = hb.recipients.findIndex(
    (r) => r.toLowerCase() === WALLET_B.address.toLowerCase()
  );
  if (myIndex === -1) {
    throw new Error(
      `Wallet B (${WALLET_B.address}) is not a recipient of heartbeat ${heartbeatId}`
    );
  }
  let decodedPayload = "<failed to decrypt>";
  let decryptOk = false;
  try {
    const ptBytes = await decryptBundleAt(payloadU8, eciesKeypair.privateKey, myIndex);
    decodedPayload = new TextDecoder().decode(ptBytes);
    decryptOk = decodedPayload === PAYLOAD_TEXT;
  } catch (e) {
    console.log(`  decrypt error: ${e.message}`);
  }

  console.log(`id:                ${heartbeatId}`);
  console.log(`owner:             ${hb.owner}`);
  console.log(`recipients:        ${JSON.stringify(hb.recipients)}`);
  console.log(`recipient ok:      ${hb.recipients[0] === WALLET_B.address}`);
  console.log(`interval:          ${hb.interval}s  (expected ${INTERVAL_SECONDS})`);
  console.log(
    `lastCheckIn:       ${new Date(Number(hb.lastCheckIn) * 1000).toISOString()}`
  );
  console.log(
    `createdAt:         ${new Date(Number(hb.createdAt) * 1000).toISOString()}`
  );
  console.log(`checkInCount:      ${hb.checkInCount}`);
  console.log(`executed:          ${hb.executed}`);
  console.log(`deactivated:       ${hb.deactivated}`);
  console.log(`on-chain payload:  ${payloadU8.length} bytes (encrypted bundle)`);
  console.log(`my index:          ${myIndex}`);
  console.log(`decrypted (utf8):  "${decodedPayload}"`);
  console.log(`decrypt match:     ${decryptOk}`);
  console.log(
    `timeRemaining:     ${finalRemaining}s  (~${minutes.toFixed(1)} min)`
  );

  return { hb, finalRemaining, minutes };
}

async function step5FinalBalances({ provider, WALLET_A, WALLET_B, balA, balB }) {
  // ----------------------------------------------------
  // Final balances
  // ----------------------------------------------------
  hr("STEP 5 — Final balances");
  const balAFinal = await provider.getBalance(WALLET_A.address);
  const balBFinal = await provider.getBalance(WALLET_B.address);
  console.log(
    `Wallet A: ${fmtEth(balA)} -> ${fmtEth(balAFinal)} (spent ${fmtEth(
      balA - balAFinal
    )})`
  );
  console.log(
    `Wallet B: ${fmtEth(balB)} -> ${fmtEth(balBFinal)} (spent ${fmtEth(
      balB - balBFinal
    )})`
  );
}

function printSummary({ heartbeatId, hb, finalRemaining, minutes, txHashes }) {
  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  hr("SUMMARY");
  console.log(`Heartbeat ID:        ${heartbeatId}`);
  console.log(`Owner (A):           ${hb.owner}`);
  console.log(`Recipient (B):       ${hb.recipients[0]}`);
  console.log(`Interval:            ${hb.interval}s (1 hour)`);
  console.log(`checkInCount:        ${hb.checkInCount}`);
  console.log(`Time remaining:      ${finalRemaining}s (~${minutes.toFixed(1)} min)`);
  console.log(`Status:              ACTIVE, waiting for expiry`);
  console.log("");
  console.log("Transactions:");
  if (txHashes.register)
    console.log(`  register():          ${txHashes.register}`);
  if (txHashes.updatePrePublicKey)
    console.log(`  updatePrePublicKey: ${txHashes.updatePrePublicKey}`);
  console.log(`  createHeartbeat():   ${txHashes.createHeartbeat}`);
  console.log(`  checkIn():           ${txHashes.checkIn}`);
  console.log("");
  console.log(
    "The heartbeat is now waiting. In ~1 hour (when timeRemaining hits 0)"
  );
  console.log(
    "it will be EXPIRED and eligible for execution. Our executor node"
  );
  console.log(
    "will pick it up and call execute(), which emits the payload to Wallet B."
  );
  console.log(
    "Wallet B can then open the Maktub app and see the message in its Inbox."
  );
  console.log("");
  console.log("It is written.");
}

module.exports = {
  step3CheckIn,
  step4ReadBack,
  step5FinalBalances,
  printSummary,
};
