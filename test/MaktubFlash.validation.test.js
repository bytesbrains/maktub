const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const {
  deployFixture,
  PER_RECIPIENT_FEE,
  SAMPLE_PAYLOAD,
} = require("./helpers/maktubFlashFixture");

describe("MaktubFlash — validation", function () {
  // ──────────────────────────────────────────────────
  //  flash — validation
  // ──────────────────────────────────────────────────
  describe("flash — validation", function () {
    it("reverts NoRecipients on an empty array", async function () {
      const { flash, sender } = await loadFixture(deployFixture);
      await expect(
        flash.connect(sender).flash([], SAMPLE_PAYLOAD, { value: 0 })
      ).to.be.revertedWithCustomError(flash, "NoRecipients");
    });

    it("reverts TooManyRecipients above 25", async function () {
      const { flash, sender } = await loadFixture(deployFixture);
      const tooMany = Array(26).fill(ethers.ZeroAddress);
      await expect(
        flash.connect(sender).flash(tooMany, SAMPLE_PAYLOAD, {
          value: 26n * PER_RECIPIENT_FEE,
        })
      ).to.be.revertedWithCustomError(flash, "TooManyRecipients");
    });

    it("reverts EmptyPayload on empty payload", async function () {
      const { flash, sender, recipient1 } = await loadFixture(deployFixture);
      await expect(
        flash.connect(sender).flash([recipient1.address], "0x", {
          value: PER_RECIPIENT_FEE,
        })
      ).to.be.revertedWithCustomError(flash, "EmptyPayload");
    });

    it("accepts a payload exactly at MAX_PAYLOAD_BYTES", async function () {
      const { flash, sender, recipient1 } = await loadFixture(deployFixture);
      const max = Number(await flash.MAX_PAYLOAD_BYTES());
      const atLimit = "0x" + "ab".repeat(max); // exactly `max` bytes
      await expect(
        flash.connect(sender).flash([recipient1.address], atLimit, {
          value: PER_RECIPIENT_FEE,
        })
      ).to.emit(flash, "FlashSent");
    });

    it("reverts PayloadTooLarge above MAX_PAYLOAD_BYTES", async function () {
      const { flash, sender, recipient1 } = await loadFixture(deployFixture);
      const max = Number(await flash.MAX_PAYLOAD_BYTES());
      const overLimit = "0x" + "ab".repeat(max + 1); // one byte over
      await expect(
        flash.connect(sender).flash([recipient1.address], overLimit, {
          value: PER_RECIPIENT_FEE,
        })
      ).to.be.revertedWithCustomError(flash, "PayloadTooLarge");
    });

    it("reverts RecipientNotFlashEligible for a v2 recipient without a ratchet key", async function () {
      const { flash, sender, beatOnly } = await loadFixture(deployFixture);
      await expect(
        flash.connect(sender).flash([beatOnly.address], SAMPLE_PAYLOAD, {
          value: PER_RECIPIENT_FEE,
        })
      )
        .to.be.revertedWithCustomError(flash, "RecipientNotFlashEligible")
        .withArgs(beatOnly.address);
    });

    it("reverts RecipientNotFlashEligible for a v1-only recipient", async function () {
      // Beat-addressable via the v1 fall-through, but Flash requires the
      // explicit v2 ratchet-key opt-in (forward secrecy, RF-S9 / #32).
      const { v1, flash, sender, stranger } = await loadFixture(deployFixture);
      await v1
        .connect(stranger)
        .register(ethers.toUtf8Bytes("legacy-v1-pre-key"));

      await expect(
        flash.connect(sender).flash([stranger.address], SAMPLE_PAYLOAD, {
          value: PER_RECIPIENT_FEE,
        })
      )
        .to.be.revertedWithCustomError(flash, "RecipientNotFlashEligible")
        .withArgs(stranger.address);
    });

    it("reverts RecipientNotFlashEligible after a recipient opts out (clears ratchet key)", async function () {
      const { flash, registry, sender, recipient1 } =
        await loadFixture(deployFixture);

      // Eligible before...
      await flash.connect(sender).flash([recipient1.address], SAMPLE_PAYLOAD, {
        value: PER_RECIPIENT_FEE,
      });

      // ...recipient revokes (e.g. device compromise)...
      await registry.connect(recipient1).setRatchetPubKey("0x");

      // ...senders now fail loud instead of encrypting to a compromised key.
      await expect(
        flash.connect(sender).flash([recipient1.address], SAMPLE_PAYLOAD, {
          value: PER_RECIPIENT_FEE,
        })
      )
        .to.be.revertedWithCustomError(flash, "RecipientNotFlashEligible")
        .withArgs(recipient1.address);
    });

    it("reverts RecipientNotFlashEligible for entirely unknown addresses", async function () {
      const { flash, sender, stranger } = await loadFixture(deployFixture);
      await expect(
        flash.connect(sender).flash([stranger.address], SAMPLE_PAYLOAD, {
          value: PER_RECIPIENT_FEE,
        })
      ).to.be.revertedWithCustomError(flash, "RecipientNotFlashEligible");
    });
  });
});
