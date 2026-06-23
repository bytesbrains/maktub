const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, stakeAndActivate, createAgedAndExecutedHeartbeat, MINIMUM_STAKE, REWARD_PER_EXECUTION, TOTAL_REWARD_POOL, YEAR_ONE_EMISSION, HALVING_PERIOD, ONE_DAY, SEVEN_DAYS, SAMPLE_PAYLOAD, CREATION_FEE } = require("./helpers/executorRewardsFixture");

describe("ExecutorRewards — distribute", function () {
  // ──────────────────────────────────────────────────
  //  Reward Distribution
  // ──────────────────────────────────────────────────
  describe("distributeReward", function () {
    it("should distribute reward to active executor with eligible heartbeat", async function () {
      const { token, rewards, core, coreRole, executor1, heartbeatOwner, recipient1 } =
        await loadFixture(deployFixture);

      const heartbeatId = await createAgedAndExecutedHeartbeat(
        core, token, rewards, heartbeatOwner, executor1, recipient1
      );

      const balBefore = await token.balanceOf(executor1.address);
      await expect(
        rewards.connect(coreRole).distributeReward(executor1.address, heartbeatId)
      )
        .to.emit(rewards, "RewardDistributed")
        .withArgs(executor1.address, REWARD_PER_EXECUTION);

      const balAfter = await token.balanceOf(executor1.address);
      expect(balAfter - balBefore).to.equal(REWARD_PER_EXECUTION);
      expect(await rewards.rewardsEarned(executor1.address)).to.equal(
        REWARD_PER_EXECUTION
      );
      expect(await rewards.totalDistributed()).to.equal(REWARD_PER_EXECUTION);
    });

    it("should revert if caller does not have CORE_ROLE", async function () {
      const { token, rewards, core, executor1, stranger, heartbeatOwner, recipient1 } =
        await loadFixture(deployFixture);

      const heartbeatId = await createAgedAndExecutedHeartbeat(
        core, token, rewards, heartbeatOwner, executor1, recipient1
      );

      await expect(
        rewards.connect(stranger).distributeReward(executor1.address, heartbeatId)
      ).to.be.reverted;
    });

    it("should revert with ExecutorNotActive for inactive executor", async function () {
      const { rewards, coreRole, executor1 } =
        await loadFixture(deployFixture);
      // executor1 hasn't staked
      await expect(
        rewards.connect(coreRole).distributeReward(executor1.address, 0)
      ).to.be.revertedWithCustomError(rewards, "ExecutorNotActive");
    });

    it("should revert with ContractPaused when paused", async function () {
      const { token, rewards, governance, coreRole, executor1 } =
        await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);
      await rewards.connect(governance).pause();

      await expect(
        rewards.connect(coreRole).distributeReward(executor1.address, 0)
      ).to.be.revertedWithCustomError(rewards, "ContractPaused");
    });

    it("should revert with HeartbeatTooYoung for recently created heartbeat", async function () {
      const { token, rewards, core, coreRole, executor1, heartbeatOwner, recipient1 } =
        await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);

      // Create heartbeat, check in, wait only 1 day (not 7), execute
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const tx = await core
        .connect(heartbeatOwner)
        .createHeartbeat(salt, [recipient1.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        });
      const receipt = await tx.wait();
      const event = receipt.logs.find((log) => {
        try { return core.interface.parseLog(log)?.name === "HeartbeatCreated"; }
        catch { return false; }
      });
      const id = core.interface.parseLog(event).args.id;

      await core.connect(heartbeatOwner).checkIn(id);
      await time.increase(ONE_DAY + 1);
      await core.connect(executor1).execute(id);

      await expect(
        rewards.connect(coreRole).distributeReward(executor1.address, id)
      ).to.be.revertedWithCustomError(rewards, "HeartbeatTooYoung");
    });

    it("should revert with InsufficientCheckIns for heartbeat with no check-ins", async function () {
      const { token, rewards, core, coreRole, executor1, heartbeatOwner, recipient1 } =
        await loadFixture(deployFixture);
      await stakeAndActivate(token, rewards, executor1, MINIMUM_STAKE);

      // Create heartbeat, don't check in, age past 7 days + interval, execute
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const tx = await core
        .connect(heartbeatOwner)
        .createHeartbeat(salt, [recipient1.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        });
      const receipt = await tx.wait();
      const event = receipt.logs.find((log) => {
        try { return core.interface.parseLog(log)?.name === "HeartbeatCreated"; }
        catch { return false; }
      });
      const id = core.interface.parseLog(event).args.id;

      // Wait past 7 days + interval so heartbeat is old enough AND expired
      await time.increase(SEVEN_DAYS + ONE_DAY + 1);
      await core.connect(executor1).execute(id);

      await expect(
        rewards.connect(coreRole).distributeReward(executor1.address, id)
      ).to.be.revertedWithCustomError(rewards, "InsufficientCheckIns");
    });
  });

  // ──────────────────────────────────────────────────
  //  Halving Schedule
  // ──────────────────────────────────────────────────
  describe("halving", function () {
    it("should return correct yearlyEmission for year 0", async function () {
      const { rewards } = await loadFixture(deployFixture);
      expect(await rewards.yearlyEmission(0)).to.equal(YEAR_ONE_EMISSION);
    });

    it("should halve emission each year", async function () {
      const { rewards } = await loadFixture(deployFixture);
      let expected = YEAR_ONE_EMISSION;
      for (let y = 0; y < 10; y++) {
        expect(await rewards.yearlyEmission(y)).to.equal(expected);
        expected = expected / 2n;
      }
    });

    it("should return 0 for year >= 10", async function () {
      const { rewards } = await loadFixture(deployFixture);
      expect(await rewards.yearlyEmission(10)).to.equal(0);
      expect(await rewards.yearlyEmission(100)).to.equal(0);
    });

    it("should return 0 reward after 10 years", async function () {
      const { rewards } = await loadFixture(deployFixture);
      // Fast-forward 11 years
      await time.increase(HALVING_PERIOD * 11);
      expect(await rewards.currentRewardAmount()).to.equal(0);
    });

    it("should track currentYear correctly", async function () {
      const { rewards } = await loadFixture(deployFixture);
      expect(await rewards.currentYear()).to.equal(0);

      await time.increase(HALVING_PERIOD);
      expect(await rewards.currentYear()).to.equal(1);

      await time.increase(HALVING_PERIOD);
      expect(await rewards.currentYear()).to.equal(2);
    });
  });
});
