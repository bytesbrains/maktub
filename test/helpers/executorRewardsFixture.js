const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const MINIMUM_STAKE = ethers.parseEther("1000");
const REWARD_PER_EXECUTION = ethers.parseEther("100");
const TOTAL_REWARD_POOL = ethers.parseEther("35000000"); // 35M
const YEAR_ONE_EMISSION = ethers.parseEther("7000000"); // 7M
const HALVING_PERIOD = 365.25 * 24 * 60 * 60; // in seconds

async function deployFixture() {
  const [admin, governance, coreRole, executor1, executor2, stranger, feeReceiver, heartbeatOwner, recipient1] =
    await ethers.getSigners();

  // Deploy token
  const Token = await ethers.getContractFactory("MktbToken");
  const token = await Token.deploy(admin.address);

  // Deploy RecipientRegistry (needed for MaktubCore)
  const Registry = await ethers.getContractFactory("RecipientRegistry");
  const registry = await Registry.deploy();

  // Deploy ExecutorRewards
  const Rewards = await ethers.getContractFactory("ExecutorRewards");
  const rewards = await Rewards.deploy(
    await token.getAddress(),
    MINIMUM_STAKE,
    REWARD_PER_EXECUTION,
    admin.address,
    governance.address
  );

  // Deploy MaktubCore (needed for heartbeat validation in distributeReward)
  // Flat curve (perAdditional = 0) — fee-curve math is covered in MaktubCore.test.js.
  const CREATION_FEE = ethers.parseEther("0.0001");
  const Core = await ethers.getContractFactory("MaktubCore");
  const core = await Core.deploy(
    CREATION_FEE,
    0n,
    feeReceiver.address,
    await registry.getAddress(),
    await rewards.getAddress()
  );

  // Link ExecutorRewards to MaktubCore
  await rewards.connect(admin).setMaktubCore(await core.getAddress());

  // Grant CORE_ROLE to coreRole signer
  const CORE_ROLE = await rewards.CORE_ROLE();
  await rewards.connect(admin).grantRole(CORE_ROLE, coreRole.address);

  // Mint tokens for staking and rewards
  const rewardsAddr = await rewards.getAddress();
  // Fund executor accounts
  await token.mint(executor1.address, ethers.parseEther("10000"));
  await token.mint(executor2.address, ethers.parseEther("10000"));
  // Fund reward pool
  await token.mint(rewardsAddr, ethers.parseEther("1000000"));

  // Register a recipient (needed for heartbeat creation)
  const preKey = ethers.toUtf8Bytes("pre-key-recipient1");
  await registry.connect(recipient1).register(preKey);

  return { token, rewards, core, registry, admin, governance, coreRole, executor1, executor2, stranger, feeReceiver, heartbeatOwner, recipient1 };
}

const ONE_DAY = 86400;
const SEVEN_DAYS = 7 * ONE_DAY;
const SAMPLE_PAYLOAD = ethers.toUtf8Bytes("QmSampleIPFSCIDHash123456789");
const CREATION_FEE = ethers.parseEther("0.0001");

// Helper: stake and activate an executor
async function stakeAndActivate(token, rewards, executor, amount) {
  await token.connect(executor).approve(await rewards.getAddress(), amount);
  await rewards.connect(executor).stake(amount);
}

// Helper: create a heartbeat, check in, age it, and execute it
// Returns the heartbeat ID
async function createAgedAndExecutedHeartbeat(core, token, rewards, heartbeatOwner, executor, recipient1) {
  // Stake executor so they can execute
  await stakeAndActivate(token, rewards, executor, MINIMUM_STAKE);

  // Create heartbeat
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const tx = await core
    .connect(heartbeatOwner)
    .createHeartbeat(salt, [recipient1.address], SAMPLE_PAYLOAD, ONE_DAY, {
      value: CREATION_FEE,
    });
  const receipt = await tx.wait();
  const event = receipt.logs.find((log) => {
    try {
      return core.interface.parseLog(log)?.name === "HeartbeatCreated";
    } catch { return false; }
  });
  const parsed = core.interface.parseLog(event);
  const id = parsed.args.id;

  // Check in (to meet MIN_CHECKINS_FOR_REWARD)
  await core.connect(heartbeatOwner).checkIn(id);

  // Age it past MIN_HEARTBEAT_AGE (7 days) and interval (1 day)
  await time.increase(SEVEN_DAYS + ONE_DAY + 1);

  // Execute
  await core.connect(executor).execute(id);

  return id;
}

module.exports = {
  MINIMUM_STAKE,
  REWARD_PER_EXECUTION,
  TOTAL_REWARD_POOL,
  YEAR_ONE_EMISSION,
  HALVING_PERIOD,
  ONE_DAY,
  SEVEN_DAYS,
  SAMPLE_PAYLOAD,
  CREATION_FEE,
  deployFixture,
  stakeAndActivate,
  createAgedAndExecutedHeartbeat,
};
