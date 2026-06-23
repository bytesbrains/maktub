// test-smart-wallet-userop.js — LIVE end-to-end ERC-4337 proof on Base Sepolia.
//
// ⚠ TRANSACTS on live Base Sepolia: funds a fresh counterfactual wallet from
//   the deployer and submits a UserOperation through a public bundler.
//   Run only when you intend to spend testnet ETH.
//
// Proves the full smart-wallet pipeline against real infrastructure
// (SW-8/SW-9 legs the local suites cannot reach):
//   1. Counterfactual address + initCode first-op deployment via bundler
//   2. WebAuthn/P-256 validation through Base's RIP-7212 precompile
//      (hardhat-local only ever exercises the OZ Solidity fallback)
//   3. Public bundler acceptance (estimation, gas pricing, inclusion)
//
// Usage: npx hardhat run scripts/test-smart-wallet-userop.js --network baseSepolia

const hre = require("hardhat");
const crypto = require("node:crypto");

const BUNDLER = "https://public.pimlico.io/v2/84532/rpc";
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const FACTORY = "0x0Dd60d0ad17B43465EF2C94D343F2d9FC476d22e";
const RP_ID = "maktub.it";
const N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const word = (v) => "0x" + BigInt(v).toString(16).padStart(64, "0");

async function bundler(method, params) {
  const res = await fetch(BUNDLER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
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

function webauthnSig({ r, s, challenge }) {
  const clientDataJSON = `{"type":"webauthn.get","challenge":"${b64url(challenge)}","origin":"https://${RP_ID}","crossOrigin":false}`;
  const authenticatorData = Buffer.concat([
    crypto.createHash("sha256").update(RP_ID).digest(),
    Buffer.from([0x05]), // UP | UV
    Buffer.from([0, 0, 0, 0]),
  ]);
  return { clientDataJSON, authenticatorData };
}

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address);

  // Fresh P-256 "passkey".
  const pair = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const x = "0x" + Buffer.from(jwk.x, "base64url").toString("hex").padStart(64, "0");
  const y = "0x" + Buffer.from(jwk.y, "base64url").toString("hex").padStart(64, "0");

  const factory = await ethers.getContractAt("MaktubSmartWalletFactory", FACTORY);
  const wallet = await factory.predictAddress(x, y, 0);
  console.log("counterfactual wallet:", wallet);

  // The op: deploy via initCode, then execute(deployer, 1 wei, "") — a
  // visible value transfer out of the fresh wallet.
  const iface = new ethers.Interface([
    "function execute(address target, uint256 value, bytes data)",
    "function createAccount(bytes32 ownerX, bytes32 ownerY, uint256 salt) payable returns (address)",
  ]);
  const callData = iface.encodeFunctionData("execute", [deployer.address, 1n, "0x"]);
  const factoryData = iface.encodeFunctionData("createAccount", [x, y, 0]);

  const gasPrice = await bundler("pimlico_getUserOperationGasPrice", []);
  const fees = gasPrice.standard;
  console.log("bundler gas price:", JSON.stringify(fees));

  const op = {
    sender: wallet,
    nonce: "0x0",
    factory: FACTORY,
    factoryData,
    callData,
    // Estimate with zero fees: the simulated prefund is fee × gas, and the
    // wallet only holds dust. Real fees are attached after estimation.
    maxFeePerGas: "0x0",
    maxPriorityFeePerGas: "0x0",
    // Dummy-but-well-formed WebAuthn signature for estimation (decodes
    // fine; validation returns SIG_VALIDATION_FAILED without reverting).
    signature: dummySignature(),
  };

  const est = await bundler("eth_estimateUserOperationGas", [op, ENTRY_POINT]);
  console.log("estimate:", JSON.stringify(est));
  op.preVerificationGas = est.preVerificationGas;
  op.verificationGasLimit = est.verificationGasLimit;
  op.callGasLimit = est.callGasLimit;
  op.maxFeePerGas = fees.maxFeePerGas;
  op.maxPriorityFeePerGas = fees.maxPriorityFeePerGas;

  // Fund the counterfactual address with exactly the prefund it can be
  // asked for (total gas × maxFee, 2× buffer) plus the 1 wei it sends.
  // Funding only after estimation succeeds — a failed run strands nothing.
  const totalGas =
    BigInt(est.preVerificationGas) + BigInt(est.verificationGasLimit) + BigInt(est.callGasLimit);
  const required = totalGas * BigInt(fees.maxFeePerGas) * 2n + 1n;
  console.log("funding prefund:", ethers.formatEther(required), "ETH");
  const fund = await deployer.sendTransaction({ to: wallet, value: required });
  await fund.wait();

  // Hash per v0.7 (read from the live EntryPoint — the ultimate oracle).
  const entryPoint = new ethers.Contract(ENTRY_POINT, [
    "function getUserOpHash((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes)) view returns (bytes32)",
  ], deployer);
  const packed = [
    op.sender,
    op.nonce,
    ethers.concat([FACTORY, factoryData]),
    callData,
    ethers.concat([ethers.toBeHex(BigInt(op.verificationGasLimit), 16), ethers.toBeHex(BigInt(op.callGasLimit), 16)]),
    op.preVerificationGas,
    ethers.concat([ethers.toBeHex(BigInt(op.maxPriorityFeePerGas), 16), ethers.toBeHex(BigInt(op.maxFeePerGas), 16)]),
    "0x",
    "0x",
  ];
  const userOpHash = await entryPoint.getUserOpHash(packed);
  console.log("userOpHash:", userOpHash);

  // Sign per the WebAuthn flow with the P-256 key.
  const challenge = Buffer.from(userOpHash.slice(2), "hex");
  const { clientDataJSON, authenticatorData } = webauthnSig({ challenge });
  const message = Buffer.concat([
    authenticatorData,
    crypto.createHash("sha256").update(clientDataJSON).digest(),
  ]);
  const { r, s } = derToLowS(crypto.sign("sha256", message, pair.privateKey));
  op.signature = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32", "uint256", "uint256", "bytes", "string"],
    [word(r), word(s), clientDataJSON.indexOf('"challenge":'), clientDataJSON.indexOf('"type":'), authenticatorData, clientDataJSON]
  );

  // The funding tx confirmed on our RPC, but the bundler's node may lag a
  // block or two — retry AA21 (insufficient prefund) briefly before failing.
  let sentHash;
  for (let attempt = 1; ; attempt++) {
    try {
      sentHash = await bundler("eth_sendUserOperation", [op, ENTRY_POINT]);
      break;
    } catch (e) {
      if (!e.message.includes("AA21") || attempt >= 5) throw e;
      console.log(`AA21 (bundler node lag?) — retry ${attempt}/5 in 4s`);
      await new Promise((r2) => setTimeout(r2, 4000));
    }
  }
  console.log("submitted:", sentHash);

  // Poll for the receipt.
  let receipt = null;
  for (let i = 0; i < 30 && !receipt; i++) {
    await new Promise((r2) => setTimeout(r2, 2000));
    receipt = await bundler("eth_getUserOperationReceipt", [sentHash]);
  }
  if (!receipt) throw new Error("no receipt after 60s");
  console.log("included in tx:", receipt.receipt.transactionHash);
  console.log("success:", receipt.success);

  const code = await ethers.provider.getCode(wallet);
  console.log("wallet deployed:", code.length > 2, `(${(code.length - 2) / 2} bytes)`);
  if (!receipt.success || code.length <= 2) process.exit(1);
  console.log("\n✓ FULL PIPELINE PROVEN: counterfactual deploy + RIP-7212 WebAuthn validation + public bundler inclusion");
}

function dummySignature() {
  const { ethers } = hre;
  const clientDataJSON = `{"type":"webauthn.get","challenge":"${"A".repeat(43)}","origin":"https://${RP_ID}","crossOrigin":false}`;
  const authenticatorData = Buffer.alloc(37, 1);
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32", "uint256", "uint256", "bytes", "string"],
    [word(1n), word(1n), clientDataJSON.indexOf('"challenge":'), clientDataJSON.indexOf('"type":'), authenticatorData, clientDataJSON]
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
