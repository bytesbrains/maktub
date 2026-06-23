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

describe("MaktubCore — views", function () {
  // ──────────────────────────────────────────────────
  //  View Functions
  // ──────────────────────────────────────────────────
  describe("View Functions", function () {
    describe("getHeartbeat", function () {
      it("should return full heartbeat data", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const id = await createDefaultHeartbeat(core, owner, [recipient1]);

        const hb = await core.getHeartbeat(id);
        expect(hb.owner).to.equal(owner.address);
        expect(hb.recipients.length).to.equal(1);
        expect(hb.recipients[0]).to.equal(recipient1.address);
        expect(hb.interval).to.equal(ONE_DAY);
        expect(hb.checkInCount).to.equal(0);
        expect(hb.executed).to.be.false;
        expect(hb.deactivated).to.be.false;
      });

      it("should revert for non-existent heartbeat", async function () {
        const { core } = await loadFixture(deployFixture);
        await expect(core.getHeartbeat(999)).to.be.revertedWithCustomError(
          core,
          "HeartbeatNotFound"
        );
      });
    });

    describe("isExpired", function () {
      it("should return false before interval elapsed", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const id = await createDefaultHeartbeat(core, owner, [recipient1]);
        expect(await core.isExpired(id)).to.be.false;
      });

      it("should return true after interval elapsed", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const id = await createDefaultHeartbeat(core, owner, [recipient1]);
        await time.increase(ONE_DAY + 1);
        expect(await core.isExpired(id)).to.be.true;
      });

      it("should revert for non-existent heartbeat", async function () {
        const { core } = await loadFixture(deployFixture);
        await expect(core.isExpired(999)).to.be.revertedWithCustomError(
          core,
          "HeartbeatNotFound"
        );
      });
    });

    describe("isExpiredAndActive", function () {
      it("should return true when expired AND still active", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const id = await createDefaultHeartbeat(core, owner, [recipient1]);
        await time.increase(ONE_DAY + 1);
        expect(await core.isExpiredAndActive(id)).to.be.true;
      });

      it("should return false when not expired", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const id = await createDefaultHeartbeat(core, owner, [recipient1]);
        expect(await core.isExpiredAndActive(id)).to.be.false;
      });

      it("should return false when already executed", async function () {
        const { core, owner, executor, recipient1 } =
          await loadFixture(deployFixture);
        const id = await createDefaultHeartbeat(core, owner, [recipient1]);
        await time.increase(ONE_DAY + 1);
        await core.connect(executor).execute(id);
        expect(await core.isExpiredAndActive(id)).to.be.false;
      });

      it("should return false when deactivated", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const id = await createDefaultHeartbeat(core, owner, [recipient1]);
        await core.connect(owner).deactivate(id);
        await time.increase(ONE_DAY + 1);
        expect(await core.isExpiredAndActive(id)).to.be.false;
      });

      it("should revert for non-existent heartbeat", async function () {
        const { core } = await loadFixture(deployFixture);
        await expect(
          core.isExpiredAndActive(999)
        ).to.be.revertedWithCustomError(core, "HeartbeatNotFound");
      });
    });

    describe("isExecutor", function () {
      it("should return true for staked executor", async function () {
        const { core, executor } = await loadFixture(deployFixture);
        expect(await core.isExecutor(executor.address)).to.be.true;
      });

      it("should return false for non-staked address", async function () {
        const { core, stranger } = await loadFixture(deployFixture);
        expect(await core.isExecutor(stranger.address)).to.be.false;
      });
    });

    describe("timeRemaining", function () {
      it("should return full interval right after creation", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const id = await createDefaultHeartbeat(core, owner, [recipient1]);
        const remaining = await core.timeRemaining(id);
        // Should be close to ONE_DAY (minus 1-2 seconds for block)
        expect(remaining).to.be.closeTo(BigInt(ONE_DAY), 5n);
      });

      it("should return 0 when expired", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const id = await createDefaultHeartbeat(core, owner, [recipient1]);
        await time.increase(ONE_DAY + 100);
        expect(await core.timeRemaining(id)).to.equal(0);
      });

      it("should decrease over time", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const id = await createDefaultHeartbeat(core, owner, [recipient1]);

        const r1 = await core.timeRemaining(id);
        await time.increase(ONE_HOUR);
        const r2 = await core.timeRemaining(id);
        expect(r2).to.be.lessThan(r1);
      });

      it("should revert for non-existent heartbeat", async function () {
        const { core } = await loadFixture(deployFixture);
        await expect(core.timeRemaining(999)).to.be.revertedWithCustomError(
          core,
          "HeartbeatNotFound"
        );
      });
    });
  });
});
