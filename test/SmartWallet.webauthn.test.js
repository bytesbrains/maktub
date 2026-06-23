// SmartWallet.webauthn.test.js — end-to-end P-256 / WebAuthn signature
// validation against the REAL contract (the SW-3/SW-4 fixture coverage
// that SmartWallet.test.js defers to).
//
// Signs with a real P-256 key per the WebAuthn authenticator flow
// (message = authenticatorData || SHA256(clientDataJSON)), normalizes the
// DER signature to low-s (OZ P256 rejects high-s as malleable), encodes
// the signature field as the BARE six-field tuple WebAuthn.tryDecodeAuth
// reads (offsets relative to the signature start — NOT abi.encode(struct),
// which would prepend a 0x20 offset word), and asserts isValidSignature
// returns the ERC-1271 magic value.
//
// The Dart encoder in mobile/lib/services/passkey/ is pinned to this same
// layout via vectors (mobile/test/user_operation_test.dart).
//
// On hardhat-local there is no RIP-7212 precompile, so this exercises the
// OZ Solidity fallback verifier — same code path Base falls back to.

const { expect } = require("chai");
const { ethers } = require("hardhat");
const crypto = require("node:crypto");

const N = BigInt(
  "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"
);
const ERC1271_MAGIC = "0x1626ba7e";

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function derToLowS(der) {
  let off = 2;
  if (der[1] & 0x80) off = 2 + (der[1] & 0x7f);
  const readInt = () => {
    if (der[off++] !== 0x02) throw new Error("bad DER");
    const len = der[off++];
    const v = BigInt("0x" + der.subarray(off, off + len).toString("hex"));
    off += len;
    return v;
  };
  const r = readInt();
  let s = readInt();
  if (s > N / 2n) s = N - s;
  return { r, s };
}

function word(v) {
  return "0x" + v.toString(16).padStart(64, "0");
}

describe("MaktubSmartWallet — WebAuthn / P-256 end-to-end", function () {
  let wallet, privateKey, x, y;

  before(async function () {
    const F = await ethers.getContractFactory("MaktubSmartWalletFactory");
    const factory = await F.deploy();
    await factory.waitForDeployment();

    const pair = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    privateKey = pair.privateKey;
    const jwk = pair.publicKey.export({ format: "jwk" });
    x = "0x" + Buffer.from(jwk.x, "base64url").toString("hex").padStart(64, "0");
    y = "0x" + Buffer.from(jwk.y, "base64url").toString("hex").padStart(64, "0");

    await (await factory.createAccount(x, y, 0)).wait();
    wallet = await ethers.getContractAt(
      "MaktubSmartWallet",
      await factory.predictAddress(x, y, 0)
    );
  });

  function signAssertion(challenge, { flags = 0x05, tamper } = {}) {
    const clientDataJSON = `{"type":"webauthn.get","challenge":"${b64url(
      tamper === "challenge" ? Buffer.from("99".repeat(32), "hex") : challenge
    )}","origin":"https://maktub.it","crossOrigin":false}`;

    const authenticatorData = Buffer.concat([
      crypto.createHash("sha256").update("maktub.it").digest(),
      Buffer.from([flags]),
      Buffer.from([0, 0, 0, 0]),
    ]);

    const message = Buffer.concat([
      authenticatorData,
      crypto.createHash("sha256").update(clientDataJSON).digest(),
    ]);
    let { r, s } = derToLowS(crypto.sign("sha256", message, privateKey));
    if (tamper === "high-s") s = N - s; // flip back to the malleable half

    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "uint256", "uint256", "bytes", "string"],
      [
        word(r),
        word(s),
        clientDataJSON.indexOf('"challenge":'),
        clientDataJSON.indexOf('"type":'),
        authenticatorData,
        clientDataJSON,
      ]
    );
  }

  const challenge = () => Buffer.from("11".repeat(31) + "ab", "hex");

  it("accepts a valid P-256 WebAuthn assertion (ERC-1271 magic value)", async function () {
    const sig = signAssertion(challenge());
    expect(
      await wallet.isValidSignature("0x" + challenge().toString("hex"), sig)
    ).to.equal(ERC1271_MAGIC);
  });

  it("rejects an assertion over the wrong challenge", async function () {
    const sig = signAssertion(challenge(), { tamper: "challenge" });
    expect(
      await wallet.isValidSignature("0x" + challenge().toString("hex"), sig)
    ).to.not.equal(ERC1271_MAGIC);
  });

  it("rejects a malleable high-s signature", async function () {
    const sig = signAssertion(challenge(), { tamper: "high-s" });
    expect(
      await wallet.isValidSignature("0x" + challenge().toString("hex"), sig)
    ).to.not.equal(ERC1271_MAGIC);
  });

  it("rejects an assertion without user verification (UV flag unset)", async function () {
    const sig = signAssertion(challenge(), { flags: 0x01 }); // UP only
    expect(
      await wallet.isValidSignature("0x" + challenge().toString("hex"), sig)
    ).to.not.equal(ERC1271_MAGIC);
  });

  it("rejects a signature from a different key", async function () {
    const stranger = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const saved = privateKey;
    privateKey = stranger.privateKey;
    const sig = signAssertion(challenge());
    privateKey = saved;
    expect(
      await wallet.isValidSignature("0x" + challenge().toString("hex"), sig)
    ).to.not.equal(ERC1271_MAGIC);
  });

  it("rejects garbage signature bytes (tryDecodeAuth failure path)", async function () {
    expect(
      await wallet.isValidSignature("0x" + challenge().toString("hex"), "0x1234")
    ).to.not.equal(ERC1271_MAGIC);
  });
});
