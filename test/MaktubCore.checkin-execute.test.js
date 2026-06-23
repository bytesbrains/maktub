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

describe("MaktubCore — checkin & execute", function () {
  // ──────────────────────────────────────────────────
  //  checkIn
  // ──────────────────────────────────────────────────
  describe("checkIn", function () {
    it("should reset the timer when owner checks in", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      // Advance time by half the interval
      await time.increase(ONE_DAY / 2);

      await expect(core.connect(owner).checkIn(id))
        .to.emit(core, "HeartbeatCheckedIn");

      // Timer should be reset — timeRemaining should be close to full interval
      const remaining = await core.timeRemaining(id);
      // Allow some tolerance for block timestamps
      expect(remaining).to.be.closeTo(BigInt(ONE_DAY), 5n);
    });

    it("should revert if caller is not the owner", async function () {
      const { core, owner, recipient1, stranger } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await expect(
        core.connect(stranger).checkIn(id)
      ).to.be.revertedWithCustomError(core, "NotOwner");
    });

    it("should revert if heartbeat is executed", async function () {
      const { core, owner, executor, recipient1 } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      // Expire and execute
      await time.increase(ONE_DAY + 1);
      await core.connect(executor).execute(id);

      await expect(
        core.connect(owner).checkIn(id)
      ).to.be.revertedWithCustomError(core, "AlreadyExecuted");
    });

    it("should revert if heartbeat is deactivated", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      await core.connect(owner).deactivate(id);

      await expect(
        core.connect(owner).checkIn(id)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");
    });

    it("should revert if heartbeat does not exist", async function () {
      const { core, owner } = await loadFixture(deployFixture);
      await expect(
        core.connect(owner).checkIn(999)
      ).to.be.revertedWithCustomError(core, "HeartbeatNotFound");
    });
  });

  // ──────────────────────────────────────────────────
  //  execute
  // ──────────────────────────────────────────────────
  describe("execute", function () {
    it("should execute when timer has expired", async function () {
      const { core, owner, executor, recipient1 } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await time.increase(ONE_DAY + 1);

      await expect(core.connect(executor).execute(id))
        .to.emit(core, "HeartbeatExecuted")
        .withArgs(id, executor.address, (await time.latest()) + 1);

      const hb = await core.getHeartbeat(id);
      expect(hb.executed).to.be.true;
    });

    it("should revert with TimerNotExpired if timer hasn't expired", async function () {
      const { core, owner, executor, recipient1 } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await expect(
        core.connect(executor).execute(id)
      ).to.be.revertedWithCustomError(core, "TimerNotExpired");
    });

    it("should revert with NotExecutor if caller is not registered", async function () {
      const { core, owner, stranger, recipient1 } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await time.increase(ONE_DAY + 1);

      await expect(
        core.connect(stranger).execute(id)
      ).to.be.revertedWithCustomError(core, "NotExecutor");
    });

    it("should revert with AlreadyExecuted on double execution", async function () {
      const { core, owner, executor, recipient1 } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await time.increase(ONE_DAY + 1);
      await core.connect(executor).execute(id);

      await expect(
        core.connect(executor).execute(id)
      ).to.be.revertedWithCustomError(core, "AlreadyExecuted");
    });

    it("should revert if heartbeat is deactivated", async function () {
      const { core, owner, executor, recipient1 } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await core.connect(owner).deactivate(id);
      await time.increase(ONE_DAY + 1);

      await expect(
        core.connect(executor).execute(id)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");
    });

    it("should revert if heartbeat does not exist", async function () {
      const { core, executor } = await loadFixture(deployFixture);
      await expect(
        core.connect(executor).execute(999)
      ).to.be.revertedWithCustomError(core, "HeartbeatNotFound");
    });
  });

  // ──────────────────────────────────────────────────
  //  permissionless execution backstop (#222) — delivery liveness
  //  must not depend on the staked-executor market or its admin.
  // ──────────────────────────────────────────────────
  describe("execute — permissionless backstop", function () {
    it("a non-executor still reverts NotExecutor before the grace elapses", async function () {
      const { core, owner, stranger, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      // Just past expiry (interval = ONE_DAY) but well within EXECUTION_GRACE.
      await time.increase(ONE_DAY + 1);
      await expect(
        core.connect(stranger).execute(id)
      ).to.be.revertedWithCustomError(core, "NotExecutor");
    });

    it("opens permissionless execution at exactly expiry + EXECUTION_GRACE + 1s, not before", async function () {
      const { core, owner, stranger, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      const hb = await core.getHeartbeat(id);
      const grace = await core.EXECUTION_GRACE();
      const open = hb.lastCheckIn + hb.interval + grace; // last gated second is exactly `open`
      // At exactly expiry + grace, the `<=` check still gates a non-executor.
      await time.setNextBlockTimestamp(open);
      await expect(
        core.connect(stranger).execute(id)
      ).to.be.revertedWithCustomError(core, "NotExecutor");
      // One second later, the backstop is open to anyone.
      await time.setNextBlockTimestamp(open + 1n);
      await expect(core.connect(stranger).execute(id)).to.emit(core, "HeartbeatExecuted");
    });

    it("anyone (e.g. the recipient) may execute after EXECUTION_GRACE past expiry", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      const grace = await core.EXECUTION_GRACE();
      // Past expiry + the full grace window — the backstop opens to anyone, unstaked.
      await time.increase(ONE_DAY + Number(grace) + 1);
      await expect(core.connect(recipient1).execute(id))
        .to.emit(core, "HeartbeatExecuted")
        .withArgs(id, recipient1.address, (await time.latest()) + 1);
      const hb = await core.getHeartbeat(id);
      expect(hb.executed).to.be.true;
    });

    it("a staked executor keeps the immediate fast path on expiry (before grace)", async function () {
      const { core, owner, executor, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      await time.increase(ONE_DAY + 1); // expired, but long before grace
      await expect(core.connect(executor).execute(id)).to.emit(core, "HeartbeatExecuted");
    });

    it("the backstop does not bypass deactivation — a deactivated beat is never executable", async function () {
      const { core, owner, stranger, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      await core.connect(owner).deactivate(id);
      const grace = await core.EXECUTION_GRACE();
      await time.increase(ONE_DAY + Number(grace) + 1);
      await expect(
        core.connect(stranger).execute(id)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");
    });
  });
});
