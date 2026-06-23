const { ethers } = require("hardhat");

const CREATION_FEE = ethers.parseEther("0.0001"); // base fee (single recipient) for testing
const PER_ADDITIONAL_FEE = ethers.parseEther("0.00003"); // per recipient beyond the first
const ONE_HOUR = 3600;
const ONE_DAY = 86400;
const SAMPLE_PAYLOAD = ethers.toUtf8Bytes("QmSampleIPFSCIDHash123456789");

async function deployFixture() {
  const [deployer, owner, executor, recipient1, recipient2, stranger, feeReceiver] =
    await ethers.getSigners();

  // Deploy MktbToken (needed for ExecutorRewards)
  const Token = await ethers.getContractFactory("MktbToken");
  const token = await Token.deploy(deployer.address);

  // Deploy RecipientRegistry
  const Registry = await ethers.getContractFactory("RecipientRegistry");
  const registry = await Registry.deploy();

  // Deploy ExecutorRewards (needed by MaktubCore for executor validation)
  const MINIMUM_STAKE = ethers.parseEther("1000");
  const REWARD_PER_EXECUTION = ethers.parseEther("100");
  const Rewards = await ethers.getContractFactory("ExecutorRewards");
  const rewards = await Rewards.deploy(
    await token.getAddress(),
    MINIMUM_STAKE,
    REWARD_PER_EXECUTION,
    deployer.address,
    deployer.address
  );

  // Deploy MaktubCore with ExecutorRewards reference
  const Core = await ethers.getContractFactory("MaktubCore");
  const core = await Core.deploy(
    CREATION_FEE,
    PER_ADDITIONAL_FEE,
    feeReceiver.address,
    await registry.getAddress(),
    await rewards.getAddress()
  );

  // Link ExecutorRewards back to MaktubCore
  await rewards.connect(deployer).setMaktubCore(await core.getAddress());

  // Register recipients
  const preKey1 = ethers.toUtf8Bytes("pre-key-recipient1");
  const preKey2 = ethers.toUtf8Bytes("pre-key-recipient2");
  await registry.connect(recipient1).register(preKey1);
  await registry.connect(recipient2).register(preKey2);

  // Stake executor in ExecutorRewards (replaces registerExecutor)
  await token.mint(executor.address, ethers.parseEther("10000"));
  await token.connect(executor).approve(await rewards.getAddress(), MINIMUM_STAKE);
  await rewards.connect(executor).stake(MINIMUM_STAKE);

  return {
    core,
    registry,
    rewards,
    token,
    deployer,
    owner,
    executor,
    recipient1,
    recipient2,
    stranger,
    feeReceiver,
  };
}

// A fresh random 32-byte salt — the per-beat uniquifier for the content-addressed
// id (`id = keccak256(creator, salt)`, D-038). Each create needs a distinct salt.
function randomSalt() {
  return ethers.hexlify(ethers.randomBytes(32));
}

// The deterministic heartbeat id the contract derives for (creator, salt) — D-038.
// `id = uint256(keccak256(abi.encode(creator, salt)))`. Returns a BigInt.
function beatId(ownerAddr, salt) {
  return BigInt(
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [ownerAddr, salt])
    )
  );
}

// Helper: create a valid heartbeat and return its ID. A unique random salt is used
// unless one is supplied (pass an explicit salt to test the deterministic-id contract).
async function createDefaultHeartbeat(core, owner, recipients, salt = randomSalt()) {
  const recipientAddrs = recipients.map((r) => r.address);
  const tx = await core
    .connect(owner)
    .createHeartbeat(salt, recipientAddrs, SAMPLE_PAYLOAD, ONE_DAY, {
      value: await core.creationFeeFor(recipientAddrs.length),
    });
  const receipt = await tx.wait();
  // heartbeat ID is returned from the function; grab from events
  const event = receipt.logs.find(
    (log) => {
      try {
        return core.interface.parseLog(log)?.name === "HeartbeatCreated";
      } catch { return false; }
    }
  );
  if (!event) {
    throw new Error("HeartbeatCreated event not found in transaction logs");
  }
  const parsed = core.interface.parseLog(event);
  return parsed.args.id;
}

// Helper: build a group of `n` freshly-registered recipient EOAs.
// register() is self-sovereign (each recipient calls it from their own
// address), so building an at-MAX group means funding + registering N EOAs.
async function registeredRecipients(registry, funder, n) {
  const addrs = [];
  for (let i = 0; i < n; i++) {
    const w = ethers.Wallet.createRandom().connect(ethers.provider);
    await funder.sendTransaction({
      to: w.address,
      value: ethers.parseEther("0.05"),
    });
    await registry.connect(w).register(ethers.toUtf8Bytes(`pre-key-${i}`));
    addrs.push(w.address);
  }
  return addrs;
}

module.exports = {
  CREATION_FEE,
  PER_ADDITIONAL_FEE,
  ONE_HOUR,
  ONE_DAY,
  SAMPLE_PAYLOAD,
  deployFixture,
  createDefaultHeartbeat,
  randomSalt,
  beatId,
  registeredRecipients,
};
