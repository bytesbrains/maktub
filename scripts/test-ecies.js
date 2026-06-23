/*
 * Maktub Protocol — ECIES unit tests
 *
 *   Pure off-chain test of the SDK's ECIES module. Exercises:
 *     1. Keypair generation
 *     2. Single-blob round-trip
 *     3. Multi-recipient bundle round-trip with correct indices
 *     4. Bundle format header bytes (v1 spec)
 *     5. Negative: wrong index, wrong key, tampered blob
 *
 *   Run: node scripts/test-ecies.js
 */

const {
  generateKeypair,
  publicKeyFromPrivate,
  encryptBlob,
  decryptBlob,
  encryptBundle,
  decryptBundleAt,
  parseBundle,
  BUNDLE_VERSION,
  COMPRESSED_PUBKEY_LENGTH,
  PRIVATE_KEY_LENGTH,
  UNCOMPRESSED_PUBKEY_LENGTH,
  IV_LENGTH,
  TAG_LENGTH,
} = require("../sdk/dist/crypto/ecies.js");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ok  - ${msg}`);
  } else {
    failed++;
    console.log(`  FAIL - ${msg}`);
  }
}

async function assertThrows(fn, msg) {
  try {
    await fn();
    failed++;
    console.log(`  FAIL - ${msg} (did not throw)`);
  } catch (_e) {
    passed++;
    console.log(`  ok  - ${msg}`);
  }
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function section(title) {
  console.log("\n" + "─".repeat(60));
  console.log(title);
  console.log("─".repeat(60));
}

async function main() {
  section("1. Keypair generation");
  const kp = generateKeypair();
  assert(kp.privateKey.length === PRIVATE_KEY_LENGTH, "private key is 32 bytes");
  assert(kp.publicKey.length === COMPRESSED_PUBKEY_LENGTH, "public key is 33 bytes (compressed)");
  assert(kp.publicKey[0] === 0x02 || kp.publicKey[0] === 0x03, "public key starts with 0x02 or 0x03");

  const derivedPk = publicKeyFromPrivate(kp.privateKey);
  assert(bytesEqual(derivedPk, kp.publicKey), "publicKeyFromPrivate matches generator output");

  section("2. Single-blob round-trip");
  const msg = new TextEncoder().encode("Hello, Maktub. It is written.");
  const blob = await encryptBlob(kp.publicKey, msg);
  assert(
    blob.length === UNCOMPRESSED_PUBKEY_LENGTH + IV_LENGTH + TAG_LENGTH + msg.length,
    `blob length matches header(${UNCOMPRESSED_PUBKEY_LENGTH + IV_LENGTH + TAG_LENGTH}) + ciphertext(${msg.length})`
  );
  assert(blob[0] === 0x04, "ephemeral pubkey starts with 0x04 (uncompressed)");
  const decrypted = await decryptBlob(kp.privateKey, blob);
  assert(bytesEqual(decrypted, msg), "decryptBlob recovers the plaintext");

  section("3. Multi-recipient bundle round-trip");
  const alice = generateKeypair();
  const bob = generateKeypair();
  const carol = generateKeypair();
  const plaintext = new TextEncoder().encode(
    "Dear kids: the seed is apple banana cherry."
  );
  const bundle = await encryptBundle(plaintext, [alice.publicKey, bob.publicKey, carol.publicKey]);

  const aliceGot = await decryptBundleAt(bundle, alice.privateKey, 0);
  const bobGot = await decryptBundleAt(bundle, bob.privateKey, 1);
  const carolGot = await decryptBundleAt(bundle, carol.privateKey, 2);

  assert(bytesEqual(aliceGot, plaintext), "Alice decrypts index 0 correctly");
  assert(bytesEqual(bobGot, plaintext), "Bob decrypts index 1 correctly");
  assert(bytesEqual(carolGot, plaintext), "Carol decrypts index 2 correctly");

  section("4. Bundle header bytes match v1 spec");
  const inspected = parseBundle(bundle);
  assert(inspected.version === BUNDLE_VERSION, `version byte = 0x${BUNDLE_VERSION.toString(16)}`);
  assert(inspected.blobs.length === 3, "parseBundle returns 3 blobs");
  assert(bundle[0] === BUNDLE_VERSION, "byte[0] = version");
  const countHi = bundle[1];
  const countLo = bundle[2];
  assert(countHi === 0 && countLo === 3, "bytes[1..3] = recipient count (big-endian uint16) = 3");

  section("5. Negative cases");
  await assertThrows(
    () => decryptBundleAt(bundle, bob.privateKey, 0),
    "Bob fails to decrypt Alice's blob (index 0)"
  );
  await assertThrows(
    () => decryptBundleAt(bundle, alice.privateKey, 5),
    "Out-of-range index throws"
  );

  // Tamper: flip a bit inside Alice's blob ciphertext and expect GCM to reject it.
  const tampered = new Uint8Array(bundle);
  // header: 1 (version) + 2 (count) + 4 (len0) = 7. First blob starts at 7.
  // Flip a byte deep inside the ciphertext (past the 65+12+16 header of the blob).
  tampered[7 + UNCOMPRESSED_PUBKEY_LENGTH + IV_LENGTH + TAG_LENGTH] ^= 0x01;
  await assertThrows(
    () => decryptBundleAt(tampered, alice.privateKey, 0),
    "Tampered ciphertext fails GCM auth"
  );

  // Wrong key: generate a fresh key unrelated to the bundle.
  const stranger = generateKeypair();
  await assertThrows(
    () => decryptBundleAt(bundle, stranger.privateKey, 0),
    "Stranger cannot decrypt Alice's blob"
  );

  section("6. String + hex coercion");
  const hexPk = "0x" + Buffer.from(alice.publicKey).toString("hex");
  const hexSk = "0x" + Buffer.from(alice.privateKey).toString("hex");
  const b2 = await encryptBundle("Plaintext as string", [hexPk]);
  const pt2 = await decryptBundleAt(b2, hexSk, 0);
  assert(
    new TextDecoder().decode(pt2) === "Plaintext as string",
    "hex pubkey + hex privkey + string plaintext round-trip"
  );

  console.log("\n" + "=".repeat(60));
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n[UNEXPECTED ERROR]", err);
  process.exit(1);
});
