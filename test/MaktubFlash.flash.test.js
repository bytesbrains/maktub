const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const {
  anyValue,
} = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const {
  deployFixture,
  PER_RECIPIENT_FEE,
  SAMPLE_PAYLOAD,
} = require("./helpers/maktubFlashFixture");

describe("MaktubFlash — flash", function () {
  // ──────────────────────────────────────────────────
  //  Deployment
  // ──────────────────────────────────────────────────
  describe("deployment", function () {
    it("wires immutables", async function () {
      const { flash, registry, feeReceiver } = await loadFixture(deployFixture);
      expect(await flash.perRecipientFee()).to.equal(PER_RECIPIENT_FEE);
      expect(await flash.feeReceiver()).to.equal(feeReceiver.address);
      expect(await flash.recipientRegistry()).to.equal(
        await registry.getAddress()
      );
      expect(await flash.MAX_RECIPIENTS()).to.equal(25);
      expect(await flash.MAX_PAYLOAD_BYTES()).to.equal(4096);
      expect(await flash.flashCount()).to.equal(0);
    });

    it("reverts on zero fee, zero receiver, zero registry", async function () {
      const { registry, feeReceiver } = await loadFixture(deployFixture);
      const Flash = await ethers.getContractFactory("MaktubFlash");

      await expect(
        Flash.deploy(0, feeReceiver.address, await registry.getAddress())
      ).to.be.revertedWith("Fee must be > 0");
      await expect(
        Flash.deploy(PER_RECIPIENT_FEE, ethers.ZeroAddress, await registry.getAddress())
      ).to.be.revertedWith("Fee receiver cannot be zero");
      await expect(
        Flash.deploy(PER_RECIPIENT_FEE, feeReceiver.address, ethers.ZeroAddress)
      ).to.be.revertedWith("Registry cannot be zero");
    });
  });

  // ──────────────────────────────────────────────────
  //  flash — happy path
  // ──────────────────────────────────────────────────
  describe("flash", function () {
    it("delivers to a single recipient in one transaction", async function () {
      const { flash, sender, recipient1, feeReceiver } =
        await loadFixture(deployFixture);

      const feeBalBefore = await ethers.provider.getBalance(feeReceiver.address);

      await expect(
        flash
          .connect(sender)
          .flash([recipient1.address], SAMPLE_PAYLOAD, {
            value: PER_RECIPIENT_FEE,
          })
      )
        .to.emit(flash, "FlashSent")
        .withArgs(
          0,
          sender.address,
          [recipient1.address],
          SAMPLE_PAYLOAD,
          anyValue
        )
        .and.to.emit(flash, "FlashDelivered")
        .withArgs(0, recipient1.address, sender.address);

      expect(await flash.flashCount()).to.equal(1);
      const feeBalAfter = await ethers.provider.getBalance(feeReceiver.address);
      expect(feeBalAfter - feeBalBefore).to.equal(PER_RECIPIENT_FEE);
    });

    it("emits one FlashDelivered per recipient (inbox filterability)", async function () {
      const { flash, sender, recipient1, recipient2 } =
        await loadFixture(deployFixture);

      const recipients = [recipient1.address, recipient2.address];
      const tx = await flash
        .connect(sender)
        .flash(recipients, SAMPLE_PAYLOAD, { value: 2n * PER_RECIPIENT_FEE });
      const receipt = await tx.wait();

      const deliveredTopic = flash.interface.getEvent("FlashDelivered").topicHash;
      const delivered = receipt.logs.filter((l) => l.topics[0] === deliveredTopic);
      expect(delivered.length).to.equal(2);

      const parsedRecipients = delivered.map(
        (l) => flash.interface.parseLog(l).args.recipient
      );
      expect(parsedRecipients).to.deep.equal(recipients);
    });

    it("increments flashCount per send and returns sequential ids", async function () {
      const { flash, sender, recipient1 } = await loadFixture(deployFixture);

      const first = await flash
        .connect(sender)
        .flash.staticCall([recipient1.address], SAMPLE_PAYLOAD, {
          value: PER_RECIPIENT_FEE,
        });
      expect(first).to.equal(0);

      await flash.connect(sender).flash([recipient1.address], SAMPLE_PAYLOAD, {
        value: PER_RECIPIENT_FEE,
      });
      await flash.connect(sender).flash([recipient1.address], SAMPLE_PAYLOAD, {
        value: PER_RECIPIENT_FEE,
      });
      expect(await flash.flashCount()).to.equal(2);
    });

    it("holds no ETH after a send (100% forwarded to Foundation)", async function () {
      const { flash, sender, recipient1, recipient2 } =
        await loadFixture(deployFixture);
      await flash
        .connect(sender)
        .flash([recipient1.address, recipient2.address], SAMPLE_PAYLOAD, {
          value: 2n * PER_RECIPIENT_FEE,
        });
      expect(
        await ethers.provider.getBalance(await flash.getAddress())
      ).to.equal(0);
    });
  });
});
