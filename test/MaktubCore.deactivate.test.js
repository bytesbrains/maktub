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

describe("MaktubCore — deactivate & constants", function () {
  // ──────────────────────────────────────────────────
  //  deactivate
  // ──────────────────────────────────────────────────
  describe("deactivate", function () {
    it("should deactivate a heartbeat", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await expect(core.connect(owner).deactivate(id))
        .to.emit(core, "HeartbeatDeactivated")
        .withArgs(id);

      const hb = await core.getHeartbeat(id);
      expect(hb.deactivated).to.be.true;
    });

    it("should be irreversible — blocks checkIn after deactivation", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      await core.connect(owner).deactivate(id);

      await expect(
        core.connect(owner).checkIn(id)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");
    });

    it("should be irreversible — blocks execute after deactivation", async function () {
      const { core, owner, executor, recipient1 } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      await core.connect(owner).deactivate(id);
      await time.increase(ONE_DAY + 1);

      await expect(
        core.connect(executor).execute(id)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");
    });

    it("should be irreversible — blocks updateRecipients after deactivation", async function () {
      const { core, owner, recipient1, recipient2 } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      await core.connect(owner).deactivate(id);

      await expect(
        core.connect(owner).updateRecipients(id, [recipient2.address])
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");
    });

    it("should be irreversible — blocks updateInterval after deactivation", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      await core.connect(owner).deactivate(id);

      await expect(
        core.connect(owner).updateInterval(id, ONE_DAY * 2)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");
    });

    it("should revert if caller is not the owner", async function () {
      const { core, owner, recipient1, stranger } =
        await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);

      await expect(
        core.connect(stranger).deactivate(id)
      ).to.be.revertedWithCustomError(core, "NotOwner");
    });

    it("should revert if already deactivated (via isActive modifier)", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      await core.connect(owner).deactivate(id);

      await expect(
        core.connect(owner).deactivate(id)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");
    });
  });

  // ──────────────────────────────────────────────────
  //  Executor eligibility (via ExecutorRewards staking)
  // ──────────────────────────────────────────────────
  describe("executor eligibility", function () {
    it("should recognize staked executor as eligible", async function () {
      const { core, executor } = await loadFixture(deployFixture);
      expect(await core.isExecutor(executor.address)).to.be.true;
    });

    it("should not recognize unstaked address as executor", async function () {
      const { core, stranger } = await loadFixture(deployFixture);
      expect(await core.isExecutor(stranger.address)).to.be.false;
    });
  });

  // ──────────────────────────────────────────────────
  //  Constants
  // ──────────────────────────────────────────────────
  describe("Constants and Immutables", function () {
    it("should have correct MIN_INTERVAL", async function () {
      const { core } = await loadFixture(deployFixture);
      expect(await core.MIN_INTERVAL()).to.equal(ONE_HOUR);
    });

    it("should have correct MAX_INTERVAL", async function () {
      const { core } = await loadFixture(deployFixture);
      expect(await core.MAX_INTERVAL()).to.equal(365 * 24 * 60 * 60);
    });

    it("should have correct MAX_RECIPIENTS", async function () {
      const { core } = await loadFixture(deployFixture);
      expect(await core.MAX_RECIPIENTS()).to.equal(25);
    });

    it("should have correct MAX_PAYLOAD_BYTES", async function () {
      const { core } = await loadFixture(deployFixture);
      expect(await core.MAX_PAYLOAD_BYTES()).to.equal(4096);
    });

    it("should have correct baseFee and perAdditionalFee", async function () {
      const { core } = await loadFixture(deployFixture);
      expect(await core.baseFee()).to.equal(CREATION_FEE);
      expect(await core.perAdditionalFee()).to.equal(PER_ADDITIONAL_FEE);
    });

    it("should have correct feeReceiver", async function () {
      const { core, feeReceiver } = await loadFixture(deployFixture);
      expect(await core.feeReceiver()).to.equal(feeReceiver.address);
    });
  });
});
