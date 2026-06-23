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

describe("Maktub Protocol — Full Lifecycle: Access & Edge", function () {
  // ══════════════════════════════════════════════════
  //  SCENARIO 8: Access Control and Authorization
  // ══════════════════════════════════════════════════
  describe("Scenario 8: Access Control and Authorization", function () {
    it("should prevent non-owner from checking in", async function () {
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
        core.connect(alice).checkIn(id)
      ).to.be.revertedWithCustomError(core, "NotOwner");
    });

    it("should prevent non-owner from deactivating", async function () {
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
        core.connect(alice).deactivate(id)
      ).to.be.revertedWithCustomError(core, "NotOwner");
    });

    it("should prevent non-owner from updating recipients", async function () {
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
        core.connect(alice).updateRecipients(id, [alice.address])
      ).to.be.revertedWithCustomError(core, "NotOwner");
    });

    it("should prevent non-owner from updating interval", async function () {
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
        core.connect(alice).updateInterval(id, ONE_DAY * 2)
      ).to.be.revertedWithCustomError(core, "NotOwner");
    });
  });

  // ══════════════════════════════════════════════════
  //  SCENARIO 9: Creation Edge Cases
  // ══════════════════════════════════════════════════
  describe("Scenario 9: Creation Edge Cases", function () {
    it("should reject creation with insufficient fee", async function () {
      const { core, registry, alice, bob } =
        await loadFixture(deployFullProtocol);

      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key"));

      await expect(
        core
          .connect(bob)
          .createHeartbeat(randomSalt(), [alice.address], SAMPLE_PAYLOAD, ONE_DAY, {
            value: CREATION_FEE - 1n,
          })
      ).to.be.revertedWithCustomError(core, "InsufficientFee");
    });

    it("should reject creation with empty payload", async function () {
      const { core, registry, alice, bob } =
        await loadFixture(deployFullProtocol);

      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key"));

      await expect(
        core.connect(bob).createHeartbeat(randomSalt(), [alice.address], "0x", ONE_DAY, {
          value: CREATION_FEE,
        })
      ).to.be.revertedWithCustomError(core, "EmptyPayload");
    });

    it("should reject creation with no recipients", async function () {
      const { core, bob } = await loadFixture(deployFullProtocol);

      await expect(
        core.connect(bob).createHeartbeat(randomSalt(), [], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        })
      ).to.be.revertedWithCustomError(core, "NoRecipients");
    });

    it("should refund excess ETH on creation", async function () {
      const { core, registry, alice, bob } =
        await loadFixture(deployFullProtocol);

      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key"));

      const excess = ethers.parseEther("0.01");
      const totalSent = CREATION_FEE + excess;

      const balBefore = await ethers.provider.getBalance(bob.address);
      const tx = await core
        .connect(bob)
        .createHeartbeat(randomSalt(), [alice.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: totalSent,
        });
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await ethers.provider.getBalance(bob.address);

      // Bob should only have paid creationFee + gas
      expect(balBefore - balAfter - gasUsed).to.equal(CREATION_FEE);
    });
  });
});
