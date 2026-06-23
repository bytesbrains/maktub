const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, CREATION_FEE, PER_ADDITIONAL_FEE, ONE_HOUR, ONE_DAY, SAMPLE_PAYLOAD, randomSalt, beatId } = require("./helpers/maktubCoreFixture");

describe("MaktubCore — create", function () {
  // ──────────────────────────────────────────────────
  //  createHeartbeat
  // ──────────────────────────────────────────────────
  describe("createHeartbeat", function () {
    it("should create a heartbeat with valid params", async function () {
      const { core, owner, recipient1, recipient2, feeReceiver } =
        await loadFixture(deployFixture);
      const recipients = [recipient1.address, recipient2.address];
      const fee = CREATION_FEE + PER_ADDITIONAL_FEE; // 2 recipients

      const feeBalBefore = await ethers.provider.getBalance(feeReceiver.address);

      const salt = randomSalt();
      const id = beatId(owner.address, salt);

      await expect(
        core
          .connect(owner)
          .createHeartbeat(salt, recipients, SAMPLE_PAYLOAD, ONE_DAY, {
            value: fee,
          })
      )
        .to.emit(core, "HeartbeatCreated")
        .withArgs(id, owner.address, recipients, ONE_DAY);

      expect(await core.heartbeatCount()).to.equal(1);

      const hb = await core.getHeartbeat(id);
      expect(hb.owner).to.equal(owner.address);
      expect(hb.recipients).to.deep.equal(recipients);
      expect(hb.interval).to.equal(ONE_DAY);
      expect(hb.checkInCount).to.equal(0);
      expect(hb.executed).to.be.false;
      expect(hb.deactivated).to.be.false;

      const feeBalAfter = await ethers.provider.getBalance(feeReceiver.address);
      expect(feeBalAfter - feeBalBefore).to.equal(fee);
    });

    it("should refund excess ETH sent", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const excess = ethers.parseEther("0.001");
      const totalSent = CREATION_FEE + excess;

      const balBefore = await ethers.provider.getBalance(owner.address);
      const tx = await core
        .connect(owner)
        .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: totalSent,
        });
      const receipt = await tx.wait();
      const gasCost = receipt.fee;
      const balAfter = await ethers.provider.getBalance(owner.address);

      // Owner should only have paid creationFee + gas, not the excess
      expect(balBefore - balAfter - gasCost).to.equal(CREATION_FEE);
    });

    it("should revert with InsufficientFee if msg.value too low", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      await expect(
        core
          .connect(owner)
          .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, ONE_DAY, {
            value: CREATION_FEE - 1n,
          })
      ).to.be.revertedWithCustomError(core, "InsufficientFee");
    });

    it("should revert with IntervalTooShort if interval < 1 hour", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      await expect(
        core
          .connect(owner)
          .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, ONE_HOUR - 1, {
            value: CREATION_FEE,
          })
      ).to.be.revertedWithCustomError(core, "IntervalTooShort");
    });

    it("should revert with IntervalTooLong if interval > 365 days", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const tooLong = 365 * ONE_DAY + 1;
      await expect(
        core
          .connect(owner)
          .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, tooLong, {
            value: CREATION_FEE,
          })
      ).to.be.revertedWithCustomError(core, "IntervalTooLong");
    });

    it("should revert with NoRecipients if empty array", async function () {
      const { core, owner } = await loadFixture(deployFixture);
      await expect(
        core.connect(owner).createHeartbeat(randomSalt(), [], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        })
      ).to.be.revertedWithCustomError(core, "NoRecipients");
    });

    it("should revert with TooManyRecipients if > 25", async function () {
      const { core, owner } = await loadFixture(deployFixture);
      const max = Number(await core.MAX_RECIPIENTS());
      const tooMany = Array(max + 1).fill(ethers.ZeroAddress);
      await expect(
        core.connect(owner).createHeartbeat(randomSalt(), tooMany, SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        })
      ).to.be.revertedWithCustomError(core, "TooManyRecipients");
    });

    it("should revert with RecipientNotRegistered for unregistered recipient", async function () {
      const { core, owner, stranger } = await loadFixture(deployFixture);
      await expect(
        core
          .connect(owner)
          .createHeartbeat(randomSalt(), [stranger.address], SAMPLE_PAYLOAD, ONE_DAY, {
            value: CREATION_FEE,
          })
      ).to.be.revertedWithCustomError(core, "RecipientNotRegistered");
    });

    it("should revert with EmptyPayload if payload is empty", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      await expect(
        core
          .connect(owner)
          .createHeartbeat(randomSalt(), [recipient1.address], "0x", ONE_DAY, {
            value: CREATION_FEE,
          })
      ).to.be.revertedWithCustomError(core, "EmptyPayload");
    });

    it("should accept a payload exactly at MAX_PAYLOAD_BYTES", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const max = Number(await core.MAX_PAYLOAD_BYTES());
      const atLimit = "0x" + "ab".repeat(max); // exactly `max` bytes
      const salt = randomSalt();
      const id = beatId(owner.address, salt);
      await expect(
        core
          .connect(owner)
          .createHeartbeat(salt, [recipient1.address], atLimit, ONE_DAY, {
            value: CREATION_FEE,
          })
      ).to.emit(core, "HeartbeatCreated");
      const hb = await core.getHeartbeat(id);
      expect(hb.payload).to.equal(atLimit);
    });

    it("should revert with PayloadTooLarge if payload exceeds MAX_PAYLOAD_BYTES", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const max = Number(await core.MAX_PAYLOAD_BYTES());
      const overLimit = "0x" + "ab".repeat(max + 1); // one byte over
      await expect(
        core
          .connect(owner)
          .createHeartbeat(randomSalt(), [recipient1.address], overLimit, ONE_DAY, {
            value: CREATION_FEE,
          })
      ).to.be.revertedWithCustomError(core, "PayloadTooLarge");
    });

    it("should accept exactly 1 hour as interval", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      await expect(
        core
          .connect(owner)
          .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, ONE_HOUR, {
            value: CREATION_FEE,
          })
      ).to.not.be.reverted;
    });

    it("should increment heartbeatCount for each creation", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      expect(await core.heartbeatCount()).to.equal(0);
      await core
        .connect(owner)
        .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        });
      expect(await core.heartbeatCount()).to.equal(1);
      await core
        .connect(owner)
        .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        });
      expect(await core.heartbeatCount()).to.equal(2);
    });
  });
});
