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

describe("Maktub Protocol — Full Lifecycle: Updates", function () {
  // ══════════════════════════════════════════════════
  //  SCENARIO 3: Update Recipients
  // ══════════════════════════════════════════════════
  describe("Scenario 3: Update Recipients", function () {
    it("should allow owner to update recipients and reset timer", async function () {
      const { core, registry, alice, bob, charlie } =
        await loadFixture(deployFullProtocol);

      // Register Alice and Charlie as recipients
      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key"));
      await registry.connect(charlie).register(ethers.toUtf8Bytes("charlie-key"));

      // Bob creates heartbeat for Alice
      const salt = randomSalt();
      await core
        .connect(bob)
        .createHeartbeat(salt, [alice.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        });
      const id = beatId(bob.address, salt);

      // Advance time halfway
      await time.increase(ONE_DAY / 2);

      // Bob updates recipients to include Charlie, replacing Alice
      await expect(
        core.connect(bob).updateRecipients(id, [charlie.address])
      )
        .to.emit(core, "RecipientsUpdated")
        .withArgs(id, [charlie.address]);

      const hb = await core.getHeartbeat(id);
      expect(hb.recipients).to.deep.equal([charlie.address]);

      // Timer was reset
      const remaining = await core.timeRemaining(id);
      expect(remaining).to.be.closeTo(BigInt(ONE_DAY), 5n);
    });

    it("should reject unregistered recipients", async function () {
      const { core, registry, alice, bob, dave } =
        await loadFixture(deployFullProtocol);

      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key"));

      const salt = randomSalt();
      await core
        .connect(bob)
        .createHeartbeat(salt, [alice.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        });
      const id = beatId(bob.address, salt);

      // Dave is not registered
      await expect(
        core.connect(bob).updateRecipients(id, [dave.address])
      ).to.be.revertedWithCustomError(core, "RecipientNotRegistered");
    });
  });

  // ══════════════════════════════════════════════════
  //  SCENARIO 4: Update Interval
  // ══════════════════════════════════════════════════
  describe("Scenario 4: Update Interval", function () {
    it("should allow owner to update interval without resetting timer", async function () {
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

      // Advance half a day
      await time.increase(ONE_DAY / 2);
      const remainingBefore = await core.timeRemaining(id);

      // Extend interval to 7 days
      const newInterval = ONE_DAY * 7;
      await expect(core.connect(bob).updateInterval(id, newInterval))
        .to.emit(core, "IntervalUpdated")
        .withArgs(id, newInterval);

      const hb = await core.getHeartbeat(id);
      expect(hb.interval).to.equal(newInterval);

      // Timer was NOT reset — remaining should jump since interval got bigger
      const remainingAfter = await core.timeRemaining(id);
      expect(remainingAfter).to.be.gt(remainingBefore);
    });

    it("should reject interval below minimum", async function () {
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

      await expect(
        core.connect(bob).updateInterval(id, ONE_HOUR - 1)
      ).to.be.revertedWithCustomError(core, "IntervalTooShort");
    });

    it("should reject interval above maximum", async function () {
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

      await expect(
        core.connect(bob).updateInterval(id, 366 * ONE_DAY)
      ).to.be.revertedWithCustomError(core, "IntervalTooLong");
    });
  });
});
