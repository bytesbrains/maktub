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
  REWARD_PER_EXECUTION,
  ONE_DAY,
  SEVEN_DAYS,
} = require("./helpers/executionRelayFixture");

describe("ExecutionRelay — reward", function () {
  // ──────────────────────────────────────────────────
  //  Happy path
  // ──────────────────────────────────────────────────
  describe("executeAndReward — happy path", function () {
    it("executes heartbeat and credits reward atomically", async function () {
      const {
        token,
        rewards,
        core,
        relay,
        operator1,
        heartbeatOwner,
        recipient1,
      } = await loadFixture(deployFixture);

      // Operator must also be staked (distributeReward checks isActiveExecutor[executor])
      await stakeOperator(token, rewards, operator1, MINIMUM_STAKE);

      const id = await createHeartbeat(core, heartbeatOwner, recipient1);
      await core.connect(heartbeatOwner).checkIn(id);
      await time.increase(SEVEN_DAYS + ONE_DAY + 1);

      const balBefore = await token.balanceOf(operator1.address);

      await expect(relay.connect(operator1).executeAndReward(id))
        .to.emit(relay, "ExecutionCompleted")
        .withArgs(id, operator1.address, REWARD_PER_EXECUTION)
        .and.to.emit(core, "HeartbeatExecuted")
        .and.to.emit(rewards, "RewardDistributed")
        .withArgs(operator1.address, REWARD_PER_EXECUTION);

      const balAfter = await token.balanceOf(operator1.address);
      expect(balAfter - balBefore).to.equal(REWARD_PER_EXECUTION);

      // Heartbeat is marked executed
      const hb = await core.getHeartbeat(id);
      expect(hb.executed).to.be.true;

      // Reward bookkeeping
      expect(await rewards.rewardsEarned(operator1.address)).to.equal(
        REWARD_PER_EXECUTION
      );
    });

    it("returns the actual reward amount distributed", async function () {
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

      const returned = await relay
        .connect(operator1)
        .executeAndReward.staticCall(id);
      expect(returned).to.equal(REWARD_PER_EXECUTION);
    });
  });

  // ──────────────────────────────────────────────────
  //  Failure modes — execution-first, reward-best-effort
  // ──────────────────────────────────────────────────
  describe("executeAndReward — execution gates & reward skips", function () {
    it("executes WITHOUT reward when ExecutorRewards is paused", async function () {
      const {
        token,
        rewards,
        core,
        relay,
        governance,
        operator1,
        heartbeatOwner,
        recipient1,
      } = await loadFixture(deployFixture);
      await stakeOperator(token, rewards, operator1, MINIMUM_STAKE);

      const id = await createHeartbeat(core, heartbeatOwner, recipient1);
      await core.connect(heartbeatOwner).checkIn(id);
      await time.increase(SEVEN_DAYS + ONE_DAY + 1);

      await rewards.connect(governance).pause();

      await expect(relay.connect(operator1).executeAndReward(id))
        .to.emit(relay, "RewardSkipped")
        .withArgs(id, operator1.address, anyValue)
        .and.to.emit(relay, "ExecutionCompleted")
        .withArgs(id, operator1.address, 0);

      const hb = await core.getHeartbeat(id);
      expect(hb.executed).to.be.true;
      expect(await rewards.rewardsEarned(operator1.address)).to.equal(0);
    });

    it("returns 0 from staticCall when the reward leg would be skipped", async function () {
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
      await time.increase(ONE_DAY + 1); // young heartbeat — reward-ineligible

      const returned = await relay
        .connect(operator1)
        .executeAndReward.staticCall(id);
      expect(returned).to.equal(0n);
    });
  });
});
