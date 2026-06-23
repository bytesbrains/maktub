const { ethers } = require("hardhat");

const MINIMUM_STAKE = ethers.parseEther("1000");
const REWARD_PER_EXECUTION = ethers.parseEther("100");
const CREATION_FEE = ethers.parseEther("0.0001");
const ONE_DAY = 86400;
const SEVEN_DAYS = 7 * ONE_DAY;
const SAMPLE_PAYLOAD = ethers.toUtf8Bytes("QmSampleIPFSCIDHash123456789");

async function deployFixture() {
  const [
    admin,
    governance,
    operator1,
    operator2,
    stranger,
    feeReceiver,
    heartbeatOwner,
    recipient1,
  ] = await ethers.getSigners();

  // Token
  const Token = await ethers.getContractFactory("MktbToken");
  const token = await Token.deploy(admin.address);

  // Recipient registry
  const Registry = await ethers.getContractFactory("RecipientRegistry");
  const registry = await Registry.deploy();

  // ExecutorRewards
  const Rewards = await ethers.getContractFactory("ExecutorRewards");
  const rewards = await Rewards.deploy(
    await token.getAddress(),
    MINIMUM_STAKE,
    REWARD_PER_EXECUTION,
    admin.address,
    governance.address
  );

  // MaktubCore — flat curve (perAdditional = 0) keeps this fixture simple;
  // the fee-curve math is covered in MaktubCore.test.js.
  const Core = await ethers.getContractFactory("MaktubCore");
  const core = await Core.deploy(
    CREATION_FEE,
    0n,
    feeReceiver.address,
    await registry.getAddress(),
    await rewards.getAddress()
  );

  // Link rewards <-> core
  await rewards.connect(admin).setMaktubCore(await core.getAddress());

  // Deploy the relay
  const Relay = await ethers.getContractFactory("ExecutionRelay");
  const relay = await Relay.deploy(
    await core.getAddress(),
    await rewards.getAddress(),
    admin.address
  );

  // Grant CORE_ROLE to the relay so it can call distributeReward
  const CORE_ROLE = await rewards.CORE_ROLE();
  await rewards
    .connect(admin)
    .grantRole(CORE_ROLE, await relay.getAddress());

  // Mint tokens:
  //  - operators (so they can stake)
  //  - reward pool (so distributeReward has tokens to send)
  //  - relay itself (so the relay can stake itself as an executor)
  await token.mint(operator1.address, ethers.parseEther("10000"));
  await token.mint(operator2.address, ethers.parseEther("10000"));
  await token.mint(await relay.getAddress(), MINIMUM_STAKE);
  await token.mint(await rewards.getAddress(), ethers.parseEther("1000000"));

  // Register a recipient so we can build heartbeats
  const preKey = ethers.toUtf8Bytes("pre-key-recipient1");
  await registry.connect(recipient1).register(preKey);

  // The relay must itself be a staked active executor in ExecutorRewards
  // because MaktubCore.execute() checks isActiveExecutor(msg.sender) and
  // the relay is msg.sender from MaktubCore's perspective. We use a
  // helper account to push the relay's tokens through the standard
  // stake() flow.
  //
  // Cleanest path: have the admin (or anyone) approve+stake on the
  // relay's behalf. Since stake() pulls from msg.sender via
  // safeTransferFrom, we instead drive the staking via an impersonated
  // account that holds the funds on the relay's behalf — but since the
  // relay holds the tokens directly, we cannot stake from it without
  // the relay implementing approve. To keep this test self-contained
  // we mint to an admin-controlled "relayStaker" who stakes on behalf
  // of the relay address.
  //
  // The cleanest production pattern is for the protocol multisig to
  // mint+stake from a treasury account, with `stakes[relay] >= min`
  // achieved by having the relay BE the staker. Since our relay
  // doesn't expose stake(), we follow the production pattern below:
  // mint to admin and have admin stake-on-behalf by transferring then
  // calling stake from the relay via low-level. Easier path: extend
  // the fixture by minting to admin and having admin stake AS the
  // relay would — i.e. we let the relay's own balance underwrite a
  // direct transfer that we then book via the standard stake path.
  //
  // For simplicity and faithfulness to production semantics, we fund the relay
  // and impersonate it (via hardhat-ethers' getImpersonatedSigner) so it stakes
  // its own tokens.
  const relayAddr = await relay.getAddress();
  await ethers.provider.send("hardhat_setBalance", [
    relayAddr,
    "0x56BC75E2D63100000", // 100 ETH
  ]);
  const relaySigner = await ethers.getImpersonatedSigner(relayAddr);
  await token.connect(relaySigner).approve(await rewards.getAddress(), MINIMUM_STAKE);
  await rewards.connect(relaySigner).stake(MINIMUM_STAKE);

  return {
    token,
    registry,
    rewards,
    core,
    relay,
    admin,
    governance,
    operator1,
    operator2,
    stranger,
    feeReceiver,
    heartbeatOwner,
    recipient1,
  };
}

// Helper: stake a non-relay operator
async function stakeOperator(token, rewards, operator, amount) {
  await token.connect(operator).approve(await rewards.getAddress(), amount);
  await rewards.connect(operator).stake(amount);
}

// Helper: create a heartbeat owned by `heartbeatOwner` and return its id
async function createHeartbeat(core, heartbeatOwner, recipient1, interval = ONE_DAY) {
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const tx = await core
    .connect(heartbeatOwner)
    .createHeartbeat(salt, [recipient1.address], SAMPLE_PAYLOAD, interval, {
      value: CREATION_FEE,
    });
  const receipt = await tx.wait();
  const event = receipt.logs.find((log) => {
    try {
      return core.interface.parseLog(log)?.name === "HeartbeatCreated";
    } catch {
      return false;
    }
  });
  return core.interface.parseLog(event).args.id;
}

module.exports = {
  MINIMUM_STAKE,
  REWARD_PER_EXECUTION,
  CREATION_FEE,
  ONE_DAY,
  SEVEN_DAYS,
  SAMPLE_PAYLOAD,
  deployFixture,
  stakeOperator,
  createHeartbeat,
};
