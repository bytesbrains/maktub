const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, stakeAndActivate, createAgedAndExecutedHeartbeat, MINIMUM_STAKE, REWARD_PER_EXECUTION, TOTAL_REWARD_POOL, YEAR_ONE_EMISSION, HALVING_PERIOD, ONE_DAY, SEVEN_DAYS, SAMPLE_PAYLOAD, CREATION_FEE } = require("./helpers/executorRewardsFixture");

describe("ExecutorRewards — admin", function () {
  // ──────────────────────────────────────────────────
  //  View Functions
  // ──────────────────────────────────────────────────
  describe("remainingRewardPool", function () {
    it("should return full pool initially", async function () {
      const { rewards } = await loadFixture(deployFixture);
      expect(await rewards.remainingRewardPool()).to.equal(TOTAL_REWARD_POOL);
    });

    it("should decrease after distribution", async function () {
      const { token, rewards, core, coreRole, executor1, heartbeatOwner, recipient1 } =
        await loadFixture(deployFixture);

      const heartbeatId = await createAgedAndExecutedHeartbeat(
        core, token, rewards, heartbeatOwner, executor1, recipient1
      );
      await rewards.connect(coreRole).distributeReward(executor1.address, heartbeatId);

      expect(await rewards.remainingRewardPool()).to.equal(
        TOTAL_REWARD_POOL - REWARD_PER_EXECUTION
      );
    });
  });

  // ──────────────────────────────────────────────────
  //  setMaktubCore — updatable wiring (fixes issue #3)
  // ──────────────────────────────────────────────────
  describe("setMaktubCore", function () {
    it("allows admin to update the core pointer and emits the event", async function () {
      const { rewards, core, admin, registry, feeReceiver } =
        await loadFixture(deployFixture);

      // Deploy a second core (simulating a clean-stack migration).
      const Core = await ethers.getContractFactory("MaktubCore");
      const core2 = await Core.deploy(
        ethers.parseEther("0.0001"),
        0n,
        feeReceiver.address,
        await registry.getAddress(),
        await rewards.getAddress()
      );

      await expect(
        rewards.connect(admin).setMaktubCore(await core2.getAddress())
      )
        .to.emit(rewards, "MaktubCoreUpdated")
        .withArgs(await core.getAddress(), await core2.getAddress());

      expect(await rewards.maktubCore()).to.equal(await core2.getAddress());
    });

    it("allows governance to update the core pointer", async function () {
      const { rewards, governance, core, registry, feeReceiver } =
        await loadFixture(deployFixture);

      const Core = await ethers.getContractFactory("MaktubCore");
      const core2 = await Core.deploy(
        ethers.parseEther("0.0001"),
        0n,
        feeReceiver.address,
        await registry.getAddress(),
        await rewards.getAddress()
      );

      await rewards.connect(governance).setMaktubCore(await core2.getAddress());
      expect(await rewards.maktubCore()).to.equal(await core2.getAddress());

      // And governance can point it back — not a one-shot.
      await rewards.connect(governance).setMaktubCore(await core.getAddress());
      expect(await rewards.maktubCore()).to.equal(await core.getAddress());
    });

    it("reverts for a caller with neither admin nor governance role", async function () {
      const { rewards, stranger, core } = await loadFixture(deployFixture);
      await expect(
        rewards.connect(stranger).setMaktubCore(await core.getAddress())
      ).to.be.revertedWithCustomError(
        rewards,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("reverts on the zero address", async function () {
      const { rewards, admin } = await loadFixture(deployFixture);
      await expect(
        rewards.connect(admin).setMaktubCore(ethers.ZeroAddress)
      ).to.be.revertedWith("MaktubCore cannot be zero");
    });
  });
});
