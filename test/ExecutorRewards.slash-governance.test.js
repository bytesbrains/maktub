const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, stakeAndActivate, createAgedAndExecutedHeartbeat, MINIMUM_STAKE, REWARD_PER_EXECUTION, TOTAL_REWARD_POOL, YEAR_ONE_EMISSION, HALVING_PERIOD, ONE_DAY, SEVEN_DAYS, SAMPLE_PAYLOAD, CREATION_FEE } = require("./helpers/executorRewardsFixture");

describe("ExecutorRewards — slash & governance", function () {
  // ──────────────────────────────────────────────────
  //  Slash
  // ──────────────────────────────────────────────────
  describe("slash", function () {
    it("should slash executor stake and deactivate", async function () {
      const { token, rewards, governance, executor1 } =
        await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);

      const slashAmount = ethers.parseEther("500");
      const govBalBefore = await token.balanceOf(governance.address);

      await expect(
        rewards
          .connect(governance)
          .slash(executor1.address, slashAmount, "malicious behavior")
      )
        .to.emit(rewards, "ExecutorSlashed")
        .withArgs(executor1.address, slashAmount, "malicious behavior");

      expect(await rewards.stakes(executor1.address)).to.equal(
        MINIMUM_STAKE - slashAmount
      );
      expect(await rewards.isActiveExecutor(executor1.address)).to.be.false;

      const govBalAfter = await token.balanceOf(governance.address);
      expect(govBalAfter - govBalBefore).to.equal(slashAmount);
    });

    it("should revert if caller does not have GOVERNANCE_ROLE", async function () {
      const { token, rewards, executor1, stranger } =
        await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);

      await expect(
        rewards
          .connect(stranger)
          .slash(executor1.address, ethers.parseEther("100"), "test")
      ).to.be.reverted;
    });

    it("should revert with ZeroAmount for zero slash", async function () {
      const { token, rewards, governance, executor1 } =
        await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);

      await expect(
        rewards.connect(governance).slash(executor1.address, 0, "test")
      ).to.be.revertedWithCustomError(rewards, "ZeroAmount");
    });

    it("should revert with InsufficientStakeBalance if slashing more than staked", async function () {
      const { token, rewards, governance, executor1 } =
        await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);

      await expect(
        rewards
          .connect(governance)
          .slash(executor1.address, MINIMUM_STAKE + 1n, "test")
      ).to.be.revertedWithCustomError(rewards, "InsufficientStakeBalance");
    });
  });

  // ──────────────────────────────────────────────────
  //  Governance Functions
  // ──────────────────────────────────────────────────
  describe("governance", function () {
    it("should update minimum stake", async function () {
      const { rewards, governance } = await loadFixture(deployFixture);
      const newMin = ethers.parseEther("5000");

      await expect(rewards.connect(governance).setMinimumStake(newMin))
        .to.emit(rewards, "MinimumStakeUpdated")
        .withArgs(MINIMUM_STAKE, newMin);

      expect(await rewards.minimumStake()).to.equal(newMin);
    });

    it("should update rewardPerExecution within cap", async function () {
      const { rewards, governance } = await loadFixture(deployFixture);
      const newReward = ethers.parseEther("200");

      await expect(
        rewards.connect(governance).setRewardPerExecution(newReward)
      )
        .to.emit(rewards, "RewardPerExecutionUpdated")
        .withArgs(REWARD_PER_EXECUTION, newReward);

      expect(await rewards.rewardPerExecution()).to.equal(newReward);
    });

    it("should revert with RewardExceedsMax if reward exceeds 10x initial", async function () {
      const { rewards, governance } = await loadFixture(deployFixture);
      // maxRewardPerExecution = 10 * REWARD_PER_EXECUTION = 1000 MKTB
      const tooHigh = ethers.parseEther("1001");

      await expect(
        rewards.connect(governance).setRewardPerExecution(tooHigh)
      ).to.be.revertedWithCustomError(rewards, "RewardExceedsMax");
    });

    it("should allow setting reward to exactly the max cap", async function () {
      const { rewards, governance } = await loadFixture(deployFixture);
      const maxReward = REWARD_PER_EXECUTION * 10n;

      await expect(
        rewards.connect(governance).setRewardPerExecution(maxReward)
      ).to.not.be.reverted;

      expect(await rewards.rewardPerExecution()).to.equal(maxReward);
    });

    it("should pause and unpause", async function () {
      const { rewards, governance } = await loadFixture(deployFixture);

      await expect(rewards.connect(governance).pause())
        .to.emit(rewards, "Paused")
        .withArgs(governance.address);
      expect(await rewards.paused()).to.be.true;

      await expect(rewards.connect(governance).unpause())
        .to.emit(rewards, "Unpaused")
        .withArgs(governance.address);
      expect(await rewards.paused()).to.be.false;
    });

    it("should revert pause if already paused", async function () {
      const { rewards, governance } = await loadFixture(deployFixture);
      await rewards.connect(governance).pause();
      await expect(
        rewards.connect(governance).pause()
      ).to.be.revertedWithCustomError(rewards, "ContractPaused");
    });

    it("should revert unpause if not paused", async function () {
      const { rewards, governance } = await loadFixture(deployFixture);
      await expect(
        rewards.connect(governance).unpause()
      ).to.be.revertedWithCustomError(rewards, "NotPaused");
    });

    it("should restrict governance functions to GOVERNANCE_ROLE", async function () {
      const { rewards, stranger } = await loadFixture(deployFixture);
      await expect(
        rewards.connect(stranger).setMinimumStake(1)
      ).to.be.reverted;
      await expect(
        rewards.connect(stranger).setRewardPerExecution(1)
      ).to.be.reverted;
      await expect(rewards.connect(stranger).pause()).to.be.reverted;
    });
  });
});
