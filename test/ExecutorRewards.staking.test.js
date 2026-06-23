const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, stakeAndActivate, createAgedAndExecutedHeartbeat, MINIMUM_STAKE, REWARD_PER_EXECUTION, TOTAL_REWARD_POOL, YEAR_ONE_EMISSION, HALVING_PERIOD, ONE_DAY, SEVEN_DAYS, SAMPLE_PAYLOAD, CREATION_FEE } = require("./helpers/executorRewardsFixture");

describe("ExecutorRewards — staking", function () {
  // ──────────────────────────────────────────────────
  //  Staking
  // ──────────────────────────────────────────────────
  describe("stake", function () {
    it("should stake tokens and become active executor", async function () {
      const { token, rewards, executor1 } = await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);

      expect(await rewards.stakes(executor1.address)).to.equal(MINIMUM_STAKE);
      expect(await rewards.isActiveExecutor(executor1.address)).to.be.true;
      expect(await rewards.totalStaked()).to.equal(MINIMUM_STAKE);
    });

    it("should emit ExecutorStaked event", async function () {
      const { token, rewards, executor1 } = await loadFixture(deployFixture);
      await token.connect(executor1).approve(await rewards.getAddress(), MINIMUM_STAKE);

      await expect(rewards.connect(executor1).stake(MINIMUM_STAKE))
        .to.emit(rewards, "ExecutorStaked")
        .withArgs(executor1.address, MINIMUM_STAKE, MINIMUM_STAKE);
    });

    it("should not activate if below minimum stake", async function () {
      const { token, rewards, executor1 } = await loadFixture(deployFixture);
      const belowMin = MINIMUM_STAKE - 1n;
      await stakeAndActivate(token, rewards, executor1, belowMin);

      expect(await rewards.isActiveExecutor(executor1.address)).to.be.false;
    });

    it("should activate when cumulative stake reaches minimum", async function () {
      const { token, rewards, executor1 } = await loadFixture(deployFixture);
      const half = MINIMUM_STAKE / 2n;
      await stakeAndActivate(token, rewards, executor1, half);
      expect(await rewards.isActiveExecutor(executor1.address)).to.be.false;

      // Stake the rest
      await token.connect(executor1).approve(await rewards.getAddress(), half);
      await rewards.connect(executor1).stake(half);
      expect(await rewards.isActiveExecutor(executor1.address)).to.be.true;
    });

    it("should revert with ZeroAmount for zero stake", async function () {
      const { rewards, executor1 } = await loadFixture(deployFixture);
      await expect(
        rewards.connect(executor1).stake(0)
      ).to.be.revertedWithCustomError(rewards, "ZeroAmount");
    });
  });

  // ──────────────────────────────────────────────────
  //  Unstaking
  // ──────────────────────────────────────────────────
  describe("unstake", function () {
    it("should unstake tokens and return them", async function () {
      const { token, rewards, executor1 } = await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);

      const balBefore = await token.balanceOf(executor1.address);
      await rewards.connect(executor1).unstake(MINIMUM_STAKE);
      const balAfter = await token.balanceOf(executor1.address);

      expect(balAfter - balBefore).to.equal(MINIMUM_STAKE);
      expect(await rewards.stakes(executor1.address)).to.equal(0);
      expect(await rewards.totalStaked()).to.equal(0);
    });

    it("should deactivate executor if stake drops below minimum", async function () {
      const { token, rewards, executor1 } = await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);
      expect(await rewards.isActiveExecutor(executor1.address)).to.be.true;

      await rewards.connect(executor1).unstake(1);
      expect(await rewards.isActiveExecutor(executor1.address)).to.be.false;
    });

    it("should emit ExecutorUnstaked event", async function () {
      const { token, rewards, executor1 } = await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);

      const unstakeAmount = ethers.parseEther("500");
      await expect(rewards.connect(executor1).unstake(unstakeAmount))
        .to.emit(rewards, "ExecutorUnstaked")
        .withArgs(executor1.address, unstakeAmount, MINIMUM_STAKE - unstakeAmount);
    });

    it("should revert with ZeroAmount for zero unstake", async function () {
      const { rewards, executor1 } = await loadFixture(deployFixture);
      await expect(
        rewards.connect(executor1).unstake(0)
      ).to.be.revertedWithCustomError(rewards, "ZeroAmount");
    });

    it("should revert with InsufficientStakeBalance if unstaking more than staked", async function () {
      const { token, rewards, executor1 } = await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);

      await expect(
        rewards.connect(executor1).unstake(MINIMUM_STAKE + 1n)
      ).to.be.revertedWithCustomError(rewards, "InsufficientStakeBalance");
    });
  });
});
