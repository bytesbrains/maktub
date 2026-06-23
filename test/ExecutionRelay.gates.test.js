const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const {
  anyValue,
} = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const {
  deployFixture,
  stakeOperator,
  createHeartbeat,
  MINIMUM_STAKE,
  ONE_DAY,
  SEVEN_DAYS,
} = require("./helpers/executionRelayFixture");

describe("ExecutionRelay — gates", function () {
  // ──────────────────────────────────────────────────
  //  Failure modes — execution-first, reward-best-effort
  // ──────────────────────────────────────────────────
  describe("executeAndReward — execution gates & reward skips", function () {
    it("reverts NotExecutor when caller (operator) is not staked", async function () {
      // Note: relay IS staked in fixture; operator1 is NOT staked here.
      // The relay's up-front operator check fires before any execution, so
      // an unstaked caller cannot ride the relay's stake.
      const { core, relay, operator1, heartbeatOwner, recipient1 } =
        await loadFixture(deployFixture);

      const id = await createHeartbeat(core, heartbeatOwner, recipient1);
      await core.connect(heartbeatOwner).checkIn(id);
      await time.increase(SEVEN_DAYS + ONE_DAY + 1);

      await expect(
        relay.connect(operator1).executeAndReward(id)
      ).to.be.revertedWithCustomError(relay, "NotExecutor");

      // The heartbeat was NOT executed — the caller never got past the gate.
      const hb = await core.getHeartbeat(id);
      expect(hb.executed).to.be.false;
    });

    it("reverts TimerNotExpired before heartbeat is eligible", async function () {
      const {
        token,
        rewards,
        core,
        relay,
        operator1,
        heartbeatOwner,
        recipient1,
      } = await loadFixture(deployFixture);
      await stakeOperator(token, rewards, operator1, MINIMUM_STAKE);

      const id = await createHeartbeat(core, heartbeatOwner, recipient1);
      // Don't advance time — timer not expired yet.

      await expect(
        relay.connect(operator1).executeAndReward(id)
      ).to.be.revertedWithCustomError(core, "TimerNotExpired");
    });

    it("reverts AlreadyExecuted on a second call for the same heartbeat", async function () {
      const {
        token,
        rewards,
        core,
        relay,
        operator1,
        heartbeatOwner,
        recipient1,
      } = await loadFixture(deployFixture);
      await stakeOperator(token, rewards, operator1, MINIMUM_STAKE);

      const id = await createHeartbeat(core, heartbeatOwner, recipient1);
      await core.connect(heartbeatOwner).checkIn(id);
      await time.increase(SEVEN_DAYS + ONE_DAY + 1);

      await relay.connect(operator1).executeAndReward(id);
      await expect(
        relay.connect(operator1).executeAndReward(id)
      ).to.be.revertedWithCustomError(core, "AlreadyExecuted");
    });

    it("executes WITHOUT reward when the heartbeat is younger than MIN_HEARTBEAT_AGE", async function () {
      // THE first-interval scenario the safety-trigger use case exists for:
      // created recently, owner goes missing, timer expires before the
      // 7-day reward-eligibility age. Delivery must land; only the reward
      // is skipped.
      const {
        token,
        rewards,
        core,
        relay,
        operator1,
        heartbeatOwner,
        recipient1,
      } = await loadFixture(deployFixture);
      await stakeOperator(token, rewards, operator1, MINIMUM_STAKE);

      const id = await createHeartbeat(core, heartbeatOwner, recipient1);
      await core.connect(heartbeatOwner).checkIn(id);
      // Past interval but NOT past MIN_HEARTBEAT_AGE (7 days)
      await time.increase(ONE_DAY + 1);

      await expect(relay.connect(operator1).executeAndReward(id))
        .to.emit(relay, "RewardSkipped")
        .withArgs(id, operator1.address, anyValue)
        .and.to.emit(relay, "ExecutionCompleted")
        .withArgs(id, operator1.address, 0)
        .and.to.emit(core, "HeartbeatExecuted");

      const hb = await core.getHeartbeat(id);
      expect(hb.executed).to.be.true;
      expect(await rewards.rewardsEarned(operator1.address)).to.equal(0);
    });

    it("executes WITHOUT reward when owner never checked in", async function () {
      const {
        token,
        rewards,
        core,
        relay,
        operator1,
        heartbeatOwner,
        recipient1,
      } = await loadFixture(deployFixture);
      await stakeOperator(token, rewards, operator1, MINIMUM_STAKE);

      const id = await createHeartbeat(core, heartbeatOwner, recipient1);
      // No check-in. Age it past both MIN_HEARTBEAT_AGE and interval.
      await time.increase(SEVEN_DAYS + ONE_DAY + 1);

      await expect(relay.connect(operator1).executeAndReward(id))
        .to.emit(relay, "RewardSkipped")
        .withArgs(id, operator1.address, anyValue)
        .and.to.emit(relay, "ExecutionCompleted")
        .withArgs(id, operator1.address, 0);

      const hb = await core.getHeartbeat(id);
      expect(hb.executed).to.be.true;
      expect(await rewards.rewardsEarned(operator1.address)).to.equal(0);
    });

    it("reverts HeartbeatNotFound for nonexistent heartbeat", async function () {
      const { token, rewards, relay, core, operator1 } =
        await loadFixture(deployFixture);
      await stakeOperator(token, rewards, operator1, MINIMUM_STAKE);

      await expect(
        relay.connect(operator1).executeAndReward(999)
      ).to.be.revertedWithCustomError(core, "HeartbeatNotFound");
    });
  });
});
