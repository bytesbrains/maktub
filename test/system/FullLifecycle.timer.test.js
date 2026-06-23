const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const {
  deployFullProtocol,
  CREATION_FEE,
  ONE_HOUR,
  ONE_DAY,
  MINIMUM_STAKE,
  REWARD_PER_EXECUTION,
  SAMPLE_PAYLOAD,
  randomSalt,
  beatId,
} = require("../helpers/fullLifecycleFixture");

describe("Maktub Protocol — Full Lifecycle: Timer", function () {
  // ══════════════════════════════════════════════════
  //  SCENARIO 10: Timer Mechanics
  // ══════════════════════════════════════════════════
  describe("Scenario 10: Timer Mechanics", function () {
    it("should correctly track time remaining", async function () {
      const { core, registry, alice, bob } =
        await loadFixture(deployFullProtocol);

      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key"));
      const salt = randomSalt();
      await core
        .connect(bob)
        .createHeartbeat(salt, [alice.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        });
      const id = beatId(bob.address, salt);

      // Right after creation, time remaining should be close to interval
      const r1 = await core.timeRemaining(id);
      expect(r1).to.be.closeTo(BigInt(ONE_DAY), 5n);

      // After 1 hour, time remaining should decrease
      await time.increase(ONE_HOUR);
      const r2 = await core.timeRemaining(id);
      expect(r2).to.be.closeTo(BigInt(ONE_DAY - ONE_HOUR), 5n);

      // After exactly ONE_DAY from creation, it should be expired
      await time.increase(ONE_DAY - ONE_HOUR + 1);
      expect(await core.isExpired(id)).to.be.true;
      expect(await core.timeRemaining(id)).to.equal(0n);
    });

    it("should reset timer on check-in preventing expiry", async function () {
      const { core, registry, rewards, token, alice, bob, charlie } =
        await loadFixture(deployFullProtocol);

      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key"));
      await token.connect(charlie).approve(await rewards.getAddress(), MINIMUM_STAKE);
      await rewards.connect(charlie).stake(MINIMUM_STAKE);

      const salt = randomSalt();
      await core
        .connect(bob)
        .createHeartbeat(salt, [alice.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        });
      const id = beatId(bob.address, salt);

      // Advance close to expiry
      await time.increase(ONE_DAY - 100);
      expect(await core.isExpired(id)).to.be.false;

      // Bob checks in — timer resets
      await core.connect(bob).checkIn(id);

      // Even after another almost-full day, still not expired
      await time.increase(ONE_DAY - 100);
      expect(await core.isExpired(id)).to.be.false;

      // Now pass the full interval since last check-in
      await time.increase(200);
      expect(await core.isExpired(id)).to.be.true;

      // Charlie executes
      await core.connect(charlie).execute(id);
      const hb = await core.getHeartbeat(id);
      expect(hb.executed).to.be.true;
      expect(hb.checkInCount).to.equal(1);
    });
  });
});
