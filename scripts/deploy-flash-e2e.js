// Minimal Flash-only stack deploy for the LOCAL mobile e2e devnet (#flash-e2e).
//
// Deploys just what Flash messaging needs — RecipientRegistry (v1, the V2
// fall-through target) + RecipientRegistryV2 + MaktubFlash — to the local
// Hardhat node, and writes their addresses to a SEPARATE json file. It never
// touches deployments/base-sepolia.json (that is the real Sepolia record).
//
// The node MUST run as chain id 84532 — the app's local-key signer hard-refuses
// any other chain (issue #82), so the devnet matches rather than weakening that
// guard:
//
//   HARDHAT_CHAIN_ID=84532 npx hardhat node                       # shell 1
//   npx hardhat run scripts/deploy-flash-e2e.js --network localhost
//
// Output: mobile/integration_test/cluster/addresses.local.json
//   (override the path via E2E_ADDR_OUT)

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// D-022 committed wei target: perRecipient = 5 µETH (Beat-base / 25).
const PER_RECIPIENT_FEE = 5_000_000_000_000n;

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  console.log(
    `[e2e-deploy] chainId=${net.chainId} deployer=${deployer.address}`
  );
  if (net.chainId !== 84532n) {
    throw new Error(
      `Expected chainId 84532 (start the node with HARDHAT_CHAIN_ID=84532); ` +
        `got ${net.chainId}. The app's local-key signer refuses any other chain.`
    );
  }

  console.log("[e2e-deploy] 1/3 RecipientRegistry (v1, fall-through)…");
  const Registry = await ethers.getContractFactory("RecipientRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const v1 = await registry.getAddress();

  console.log("[e2e-deploy] 2/3 RecipientRegistryV2…");
  const V2 = await ethers.getContractFactory("RecipientRegistryV2");
  const registryV2 = await V2.deploy(v1);
  await registryV2.waitForDeployment();
  const v2 = await registryV2.getAddress();

  console.log("[e2e-deploy] 3/3 MaktubFlash…");
  const Flash = await ethers.getContractFactory("MaktubFlash");
  const flash = await Flash.deploy(PER_RECIPIENT_FEE, deployer.address, v2);
  await flash.waitForDeployment();
  const flashAddr = await flash.getAddress();

  // Minimal Beat-READ stack so the Inbox/Beats screens (which always query
  // MaktubCore.getInboxBeats / getOwnerBeats) don't crash decoding an empty
  // return from a non-existent contract. No role setup / token distribution —
  // the Flash e2e never creates a beat, it only reads (empty) lists.
  console.log("[e2e-deploy] +Beat-read stack (Token, ExecutorRewards, Core)…");
  const Token = await ethers.getContractFactory("MktbToken");
  const token = await Token.deploy(deployer.address);
  await token.waitForDeployment();
  const ExecutorRewards = await ethers.getContractFactory("ExecutorRewards");
  const rewards = await ExecutorRewards.deploy(
    await token.getAddress(),
    ethers.parseEther("1000"),
    ethers.parseEther("100"),
    deployer.address,
    deployer.address
  );
  await rewards.waitForDeployment();
  const Core = await ethers.getContractFactory("MaktubCore");
  const core = await Core.deploy(
    124000000000000n, // baseFee (D-023)
    40000000000000n, // perAdditionalFee
    deployer.address, // fee receiver
    v1, // RecipientRegistry
    await rewards.getAddress()
  );
  await core.waitForDeployment();
  const coreAddr = await core.getAddress();

  // Sanity: V2 wired to v1, fee as expected.
  if ((await registryV2.v1()) !== ethers.getAddress(v1)) {
    throw new Error("V2 fall-through pointer mismatch");
  }
  if ((await flash.perRecipientFee()) !== PER_RECIPIENT_FEE) {
    throw new Error("perRecipientFee mismatch");
  }

  // Fund the e2e participant accounts. Hardhat account-0 (the deployer, used as
  // the primary sender) is already funded; these extra participants are derived
  // index-0 from the SAME mnemonics the Flutter e2e test imports
  // (flash_e2e_test.dart `_kE2eMnemonics`), so the test's imported accounts hold
  // ETH for registration + flash fees. setBalance is a devnet-only cheat.
  const E2E_MNEMONICS = [
    "legal winner thank year wave sausage worth useful legal winner thank yellow",
    "letter advice cage absurd amount doctor acoustic avoid letter advice cage above",
    "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong",
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    "scheme spot photo card baby mountain device kick cradle pact join borrow",
    // Dedicated to reading_key_recovery_e2e_test.dart — touched by NO other
    // test, so its on-chain reading key is whatever that test registers
    // (the seed-derived one), not a random key left by an earlier test.
    "ozone drill grab fiber curtain grace pudding thank cruise elder eight picnic",
    // Dedicated to passkey_reading_key_recovery_e2e_test.dart — a funded EOA
    // that stands in as the on-chain registrant for the PRF-DERIVED reading key
    // (real smart-wallet userOp signing is the deferred step, #307); touched by
    // no other test so its on-chain key is exactly the PRF-derived one.
    "dream history tattoo vintage pear city clock cricket wheel top twelve door",
  ];
  const HUNDRED_ETH = "0x56BC75E2D63100000"; // 100 ETH in wei (hex)
  for (const m of E2E_MNEMONICS) {
    const w = ethers.Wallet.fromPhrase(m);
    await ethers.provider.send("hardhat_setBalance", [w.address, HUNDRED_ETH]);
    console.log(`[e2e-deploy] funded participant ${w.address}`);
  }

  const out = {
    note: "LOCAL e2e devnet only — generated by scripts/deploy-flash-e2e.js. Never a real deployment.",
    chainId: Number(net.chainId),
    rpcUrl: process.env.E2E_RPC_URL || "http://127.0.0.1:8545",
    flashDeployBlock: 0,
    deployedAtBlock: await ethers.provider.getBlockNumber(),
    contracts: {
      RecipientRegistry: v1,
      RecipientRegistryV2: v2,
      MaktubFlash: flashAddr,
      MaktubCore: coreAddr,
    },
    perRecipientFee: PER_RECIPIENT_FEE.toString(),
  };

  const outPath =
    process.env.E2E_ADDR_OUT ||
    path.join(
      __dirname,
      "..",
      "mobile",
      "integration_test",
      "cluster",
      "addresses.local.json"
    );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log("[e2e-deploy] wrote", outPath);
  console.log(JSON.stringify(out.contracts, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
