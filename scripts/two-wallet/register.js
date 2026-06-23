/*
 * Two-Wallet E2E Test — STEP 1: Wallet B registers as a recipient (ECIES key).
 *
 * Body copied verbatim from scripts/two-wallet-test.js. Threads txHashes and
 * returns the ECIES keypair for later decryption.
 */

const fs = require("fs");
const path = require("path");
const {
  generateKeypair,
  publicKeyFromPrivate,
} = require("../../sdk/dist/crypto/ecies.js");
const { wait, hr } = require("./helpers.js");

async function step1Register({ WALLET_B, registryB, txHashes }) {
  // ----------------------------------------------------
  // STEP 1: Wallet B registers as a recipient (ECIES key)
  // ----------------------------------------------------
  hr("STEP 1 — Wallet B registers with an ECIES public key");

  // Local key storage for the test script. In production this lives in
  // flutter_secure_storage / browser localStorage, not on disk.
  const KEY_DIR = path.join(__dirname, "..", "..", ".maktub-keys");
  if (!fs.existsSync(KEY_DIR)) fs.mkdirSync(KEY_DIR, { recursive: true });
  const KEY_FILE = path.join(KEY_DIR, `${WALLET_B.address.toLowerCase()}.json`);

  let eciesKeypair;
  if (fs.existsSync(KEY_FILE)) {
    const saved = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
    const sk = Uint8Array.from(Buffer.from(saved.privateKey.slice(2), "hex"));
    const pk = publicKeyFromPrivate(sk);
    eciesKeypair = { privateKey: sk, publicKey: pk };
    console.log(`Loaded Wallet B's ECIES key from ${KEY_FILE}`);
  } else {
    eciesKeypair = generateKeypair();
    fs.writeFileSync(
      KEY_FILE,
      JSON.stringify(
        {
          address: WALLET_B.address,
          privateKey: "0x" + Buffer.from(eciesKeypair.privateKey).toString("hex"),
          publicKey: "0x" + Buffer.from(eciesKeypair.publicKey).toString("hex"),
        },
        null,
        2
      )
    );
    console.log(`Generated new ECIES key, saved to ${KEY_FILE}`);
  }
  const eciesPubHex = "0x" + Buffer.from(eciesKeypair.publicKey).toString("hex");
  console.log(`ECIES public key:   ${eciesPubHex}`);

  const alreadyRegistered = await registryB.isRegistered(WALLET_B.address);
  if (alreadyRegistered) {
    // Check what pubkey is on-chain. If it's a 64-byte dummy (legacy), try
    // to update to the real ECIES key. If it already matches, skip.
    const onChain = await registryB.getPrePublicKey(WALLET_B.address);
    if (onChain.toLowerCase() === eciesPubHex.toLowerCase()) {
      console.log(
        "Wallet B is already registered with the local ECIES key. Skipping."
      );
    } else {
      console.log(
        `On-chain pubkey (${onChain.length / 2 - 1}B) differs; rotating to ECIES.`
      );
      const tx = await registryB.updatePrePublicKey(eciesPubHex);
      console.log(`  tx sent: ${tx.hash}`);
      const rcpt = await tx.wait(1);
      txHashes.updatePrePublicKey = rcpt.hash;
      console.log(`  mined in block ${rcpt.blockNumber}, gas used ${rcpt.gasUsed}`);
      await wait(3000);
    }
  } else {
    const tx = await registryB.register(eciesPubHex);
    console.log(`  tx sent: ${tx.hash}`);
    const rcpt = await tx.wait(1);
    txHashes.register = rcpt.hash;
    console.log(
      `  mined in block ${rcpt.blockNumber}, gas used ${rcpt.gasUsed}`
    );
    await wait(3000);
  }
  const isReg = await registryB.isRegistered(WALLET_B.address);
  console.log(`Wallet B isRegistered(): ${isReg}`);

  return { eciesKeypair };
}

module.exports = { step1Register };
