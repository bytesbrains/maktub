/*
 * Two-Wallet E2E Test — STEP 2: Wallet A creates the heartbeat.
 *
 * Body copied verbatim from scripts/two-wallet-test.js, including the hard
 * encryption safety gate. Returns the heartbeat ID for the verify phase.
 */

const { ethers } = require("ethers");
const { encryptBundle } = require("../../sdk/dist/crypto/ecies.js");
const {
  PAYLOAD_TEXT,
  INTERVAL_SECONDS,
  CREATION_FEE,
  wait,
  fmtEth,
  hr,
} = require("./helpers.js");

async function step2CreateHeartbeat({ WALLET_B, registryA, coreA, txHashes }) {
  // ----------------------------------------------------
  // STEP 2: Wallet A creates the heartbeat
  // ----------------------------------------------------
  hr("STEP 2 — Wallet A creates heartbeat");
  const countBefore = await coreA.heartbeatCount();
  console.log(`heartbeatCount before: ${countBefore}`);

  const recipients = [WALLET_B.address];

  // Fetch each recipient's ECIES pubkey from the registry and encrypt.
  const recipientPubkeys = [];
  for (const addr of recipients) {
    const pk = await registryA.getPrePublicKey(addr);
    recipientPubkeys.push(pk);
  }
  const plaintextBytes = ethers.toUtf8Bytes(PAYLOAD_TEXT);
  const bundleBytes = await encryptBundle(plaintextBytes, recipientPubkeys);
  const bundleHex = "0x" + Buffer.from(bundleBytes).toString("hex");

  // -------- hard safety gate: the bundle MUST be encrypted --------
  // These checks scream and abort if anything looks like plaintext got through.
  function bytesLookPrintableUtf8(u8, sampleLen = 32) {
    const n = Math.min(sampleLen, u8.length);
    if (n === 0) return false;
    let printable = 0;
    for (let i = 0; i < n; i++) {
      const b = u8[i];
      // printable ASCII 0x20..0x7E, plus common whitespace \t \n \r
      if ((b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d) {
        printable++;
      }
    }
    return printable / n > 0.9;
  }
  const bundleU8 = bundleBytes instanceof Uint8Array ? bundleBytes : new Uint8Array(bundleBytes);
  if (bundleU8[0] !== 0x01) {
    console.error(
      `\n[ABORT] Encrypted bundle does not start with 0x01 version byte.` +
        `\n  first byte: 0x${bundleU8[0].toString(16)}` +
        `\n  This is NOT a valid v1 ECIES bundle. Refusing to submit plaintext on-chain.`
    );
    process.exit(2);
  }
  if (bundleU8.length <= plaintextBytes.length) {
    console.error(
      `\n[ABORT] Bundle (${bundleU8.length}B) is not larger than plaintext` +
        ` (${plaintextBytes.length}B). A real ECIES v1 bundle must add header + ` +
        `ephemeral pubkey + IV + tag = at least 96 bytes of overhead per recipient.` +
        `\n  Refusing to submit plaintext on-chain.`
    );
    process.exit(2);
  }
  // If the first 32 bytes of the payload are >90% printable ASCII, the
  // payload is almost certainly plaintext (or some base64-wrapped blob) —
  // NOT a binary encrypted bundle. Abort loudly.
  if (bytesLookPrintableUtf8(bundleU8)) {
    console.error(
      `\n[ABORT] Payload looks like printable UTF-8 text, not encrypted bytes!` +
        `\n  first 32 bytes (hex): 0x${Buffer.from(bundleU8.slice(0, 32)).toString("hex")}` +
        `\n  first 32 bytes (utf8): ${JSON.stringify(Buffer.from(bundleU8.slice(0, 32)).toString("utf8"))}` +
        `\n  Refusing to submit plaintext on-chain.`
    );
    process.exit(2);
  }
  // Paranoid: the bundle must not contain the plaintext verbatim anywhere.
  {
    const hay = Buffer.from(bundleU8).toString("binary");
    const needle = Buffer.from(plaintextBytes).toString("binary");
    if (needle.length >= 8 && hay.indexOf(needle) !== -1) {
      console.error(
        `\n[ABORT] The encrypted bundle contains the plaintext verbatim.` +
          `\n  Encryption is broken. Refusing to submit.`
      );
      process.exit(2);
    }
  }

  console.log(`Recipient:          ${WALLET_B.address}`);
  console.log(`Plaintext:          "${PAYLOAD_TEXT}"`);
  console.log(`Plaintext size:     ${plaintextBytes.length} bytes`);
  console.log(`Encrypted bundle:   ${bundleBytes.length} bytes (v1 ECIES)`);
  console.log(`Bundle version byte: 0x${bundleU8[0].toString(16).padStart(2, "0")} (expected 0x01)`);
  console.log(`Bundle (hex head):  ${bundleHex.slice(0, 82)}…`);
  console.log(`Encryption gate:    PASS (payload is binary, differs from plaintext)`);
  console.log(`Interval:           ${INTERVAL_SECONDS} s (1 hour)`);
  console.log(`Creation fee:       ${fmtEth(CREATION_FEE)}`);

  const salt = ethers.hexlify(ethers.randomBytes(32));
  console.log(`Salt:               ${salt}`);

  const txCreate = await coreA.createHeartbeat(
    salt,
    recipients,
    bundleBytes,
    INTERVAL_SECONDS,
    { value: CREATION_FEE }
  );
  console.log(`  tx sent: ${txCreate.hash}`);
  const rcptCreate = await txCreate.wait(1);
  txHashes.createHeartbeat = rcptCreate.hash;
  console.log(
    `  mined in block ${rcptCreate.blockNumber}, gas used ${rcptCreate.gasUsed}`
  );

  // Parse HeartbeatCreated event to get ID
  let heartbeatId;
  for (const log of rcptCreate.logs) {
    try {
      const parsed = coreA.interface.parseLog(log);
      if (parsed && parsed.name === "HeartbeatCreated") {
        heartbeatId = parsed.args[0];
        break;
      }
    } catch (_) {}
  }
  if (heartbeatId === undefined) {
    // Fallback: ids are deterministic — keccak256(abi.encode(msg.sender, salt)).
    // msg.sender is Wallet A, the signer coreA is connected to.
    const senderAddress = await coreA.runner.getAddress();
    heartbeatId = BigInt(
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "bytes32"],
          [senderAddress, salt]
        )
      )
    );
  }
  console.log(`Heartbeat ID:  ${heartbeatId}`);
  await wait(3000);

  return { heartbeatId };
}

module.exports = { step2CreateHeartbeat };
