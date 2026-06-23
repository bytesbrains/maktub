/*
 * Smoke test: the encryption helpers exposed on MaktubClient work
 * without a network/provider — they should be pure functions that
 * never trigger init(). encryptForRegisteredRecipients is the only
 * helper that needs a live provider.
 *
 *   node scripts/test-maktub-client-crypto.js
 */

const { MaktubClient } = require("../sdk/dist/index.js");

async function main() {
  // Minimal fake provider. The crypto helpers should never touch it.
  const fakeProvider = {
    getNetwork: async () => {
      throw new Error("init() should not be called by crypto helpers");
    },
  };
  const maktub = new MaktubClient({
    provider: fakeProvider,
    addresses: {
      maktubCore: "0x" + "00".repeat(20),
      recipientRegistry: "0x" + "00".repeat(20),
      mktbToken: "0x" + "00".repeat(20),
      executorRewards: "0x" + "00".repeat(20),
      mktbGovernance: "0x" + "00".repeat(20),
    },
  });

  // generate keys
  const alice = maktub.generateRecipientKey();
  const bob = maktub.generateRecipientKey();
  console.log(`alice pk: ${maktub.bytesToHex(alice.publicKey)}`);
  console.log(`bob   pk: ${maktub.bytesToHex(bob.publicKey)}`);

  // encrypt for both
  const plaintext = "It is written — for Alice and Bob.";
  const bundle = await maktub.encryptForRecipients(plaintext, [
    alice.publicKey,
    bob.publicKey,
  ]);
  const info = maktub.inspectBundle(bundle);
  console.log(`bundle: ${bundle.length} bytes, version=${info.version}, count=${info.count}`);

  // each decrypts their own
  const aliceGot = new TextDecoder().decode(
    await maktub.decryptMyBlob(bundle, alice.privateKey, 0)
  );
  const bobGot = new TextDecoder().decode(
    await maktub.decryptMyBlob(bundle, bob.privateKey, 1)
  );

  const ok = aliceGot === plaintext && bobGot === plaintext;
  console.log(`alice got: "${aliceGot}"`);
  console.log(`bob   got: "${bobGot}"`);
  console.log(ok ? "PASS" : "FAIL");
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
