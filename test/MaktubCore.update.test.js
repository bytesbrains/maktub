const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const {
  deployFixture,
  createDefaultHeartbeat,
  CREATION_FEE,
  PER_ADDITIONAL_FEE,
  ONE_HOUR,
  ONE_DAY,
  SAMPLE_PAYLOAD,
} = require("./helpers/maktubCoreFixture");

describe("MaktubCore — update", function () {
  // ──────────────────────────────────────────────────
  //  updateRecipients
  // ──────────────────────────────────────────────────
  describe("updateRecipients", function () {
    it("should update recipients and reset timer", async function () {
      const { core, owner, recipient1, recipient2 } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await time.increase(ONE_DAY / 2);

      const newRecipients = [recipient2.address];
      await expect(
        core.connect(owner).updateRecipients(id, newRecipients)
      )
        .to.emit(core, "RecipientsUpdated")
        .withArgs(id, newRecipients);

      const hb = await core.getHeartbeat(id);
      expect(hb.recipients).to.deep.equal(newRecipients);

      // Timer should have been reset
      const remaining = await core.timeRemaining(id);
      expect(remaining).to.be.closeTo(BigInt(ONE_DAY), 5n);
    });

    it("should revert if caller is not owner", async function () {
      const { core, owner, recipient1, stranger } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await expect(
        core.connect(stranger).updateRecipients(id, [recipient1.address])
      ).to.be.revertedWithCustomError(core, "NotOwner");
    });

    it("should revert with NoRecipients for empty array", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await expect(
        core.connect(owner).updateRecipients(id, [])
      ).to.be.revertedWithCustomError(core, "NoRecipients");
    });

    it("should revert with TooManyRecipients if > 25", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      const tooMany = Array(26).fill(ethers.ZeroAddress);
      await expect(
        core.connect(owner).updateRecipients(id, tooMany)
      ).to.be.revertedWithCustomError(core, "TooManyRecipients");
    });

    it("should revert if new recipient is not registered", async function () {
      const { core, owner, recipient1, stranger } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await expect(
        core.connect(owner).updateRecipients(id, [stranger.address])
      ).to.be.revertedWithCustomError(core, "RecipientNotRegistered");
    });

    it("should revert if heartbeat is executed", async function () {
      const { core, owner, executor, recipient1, recipient2 } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      await time.increase(ONE_DAY + 1);
      await core.connect(executor).execute(id);

      await expect(
        core.connect(owner).updateRecipients(id, [recipient2.address])
      ).to.be.revertedWithCustomError(core, "AlreadyExecuted");
    });
  });

  // ──────────────────────────────────────────────────
  //  updateInterval
  // ──────────────────────────────────────────────────
  describe("updateInterval", function () {
    it("should update the interval without resetting timer", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      // Advance half a day
      await time.increase(ONE_DAY / 2);
      const remainingBefore = await core.timeRemaining(id);

      const newInterval = ONE_DAY * 7;
      await expect(core.connect(owner).updateInterval(id, newInterval))
        .to.emit(core, "IntervalUpdated")
        .withArgs(id, newInterval);

      const hb = await core.getHeartbeat(id);
      expect(hb.interval).to.equal(newInterval);

      // Timer should NOT have been reset — remaining should jump due to longer interval
      const remainingAfter = await core.timeRemaining(id);
      // With a 7-day interval and ~12h elapsed, remaining should be ~6.5 days
      expect(remainingAfter).to.be.greaterThan(remainingBefore);
    });

    it("should revert if caller is not owner", async function () {
      const { core, owner, recipient1, stranger } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await expect(
        core.connect(stranger).updateInterval(id, ONE_DAY * 2)
      ).to.be.revertedWithCustomError(core, "NotOwner");
    });

    it("should revert with IntervalTooShort if below minimum", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await expect(
        core.connect(owner).updateInterval(id, ONE_HOUR - 1)
      ).to.be.revertedWithCustomError(core, "IntervalTooShort");
    });

    it("should revert with IntervalTooLong if above maximum", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      const tooLong = 365 * ONE_DAY + 1;

      await expect(
        core.connect(owner).updateInterval(id, tooLong)
      ).to.be.revertedWithCustomError(core, "IntervalTooLong");
    });

    it("should accept exactly 1 hour interval", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await expect(core.connect(owner).updateInterval(id, ONE_HOUR)).to.not.be
        .reverted;
    });

    it("should revert if heartbeat is deactivated", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      await core.connect(owner).deactivate(id);

      await expect(
        core.connect(owner).updateInterval(id, ONE_DAY * 2)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");
    });
  });
});
