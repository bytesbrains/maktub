const { ethers } = require("hardhat");

const CREATION_FEE = ethers.parseEther("0.000124");
const ONE_HOUR = 3600;
const ONE_DAY = 86400;
const MINIMUM_STAKE = ethers.parseEther("1000");
const REWARD_PER_EXECUTION = ethers.parseEther("100");
const SAMPLE_PAYLOAD = ethers.toUtf8Bytes("My secret seed phrase");

async function deployFullProtocol() {
  const [deployer, alice, bob, charlie, dave, feeReceiver] =
    await ethers.getSigners();

  // 1. Deploy MktbToken
  const Token = await ethers.getContractFactory("MktbToken");
  const token = await Token.deploy(deployer.address);

  // 2. Deploy RecipientRegistry
  const Registry = await ethers.getContractFactory("RecipientRegistry");
  const registry = await Registry.deploy();

  // 3. Deploy ExecutorRewards
  const Rewards = await ethers.getContractFactory("ExecutorRewards");
  const rewards = await Rewards.deploy(
    await token.getAddress(),
    MINIMUM_STAKE,
    REWARD_PER_EXECUTION,
    deployer.address,
    deployer.address
  );

  // 4. Deploy MaktubCore — flat curve (perAdditional = 0) so every
  //    existing single- and multi-recipient assertion in this suite keeps
  //    its exact fee math; the curve itself is covered in MaktubCore.test.js.
  const Core = await ethers.getContractFactory("MaktubCore");
  const core = await Core.deploy(
    CREATION_FEE,
    0n,
    feeReceiver.address,
    await registry.getAddress(),
    await rewards.getAddress()
  );

  // 5. Link ExecutorRewards back to MaktubCore
  await rewards.connect(deployer).setMaktubCore(await core.getAddress());

  // 6. Distribute tokens
  //    - 35M to ExecutorRewards (reward pool)
  //    - Remaining to deployer for distribution
  await token.mint(await rewards.getAddress(), ethers.parseEther("35000000"));
  await token.mint(charlie.address, ethers.parseEther("10000")); // Charlie will stake
  await token.mint(dave.address, ethers.parseEther("5000")); // Dave for edge cases

  return {
    core,
    registry,
    rewards,
    token,
    deployer,
    alice,
    bob,
    charlie,
    dave,
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

module.exports = {
  CREATION_FEE,
  ONE_HOUR,
  ONE_DAY,
  MINIMUM_STAKE,
  REWARD_PER_EXECUTION,
  SAMPLE_PAYLOAD,
  deployFullProtocol,
  randomSalt,
  beatId,
};
