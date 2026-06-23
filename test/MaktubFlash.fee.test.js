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

describe("MaktubFlash — fee & fire-and-forget", function () {
  // ──────────────────────────────────────────────────
  //  Fee — pure linear, exact msg.value (D-022/D-023)
  // ──────────────────────────────────────────────────
  describe("fee", function () {
    it("flashFeeFor scales linearly with no base term", async function () {
      const { flash } = await loadFixture(deployFixture);
      expect(await flash.flashFeeFor(1)).to.equal(PER_RECIPIENT_FEE);
      expect(await flash.flashFeeFor(2)).to.equal(2n * PER_RECIPIENT_FEE);
      expect(await flash.flashFeeFor(25)).to.equal(25n * PER_RECIPIENT_FEE);
    });

    it("flashFeeFor reverts on a zero count", async function () {
      const { flash } = await loadFixture(deployFixture);
      await expect(flash.flashFeeFor(0)).to.be.revertedWithCustomError(
        flash,
        "NoRecipients"
      );
    });

    it("reverts WrongFee on underpayment with expected/provided amounts", async function () {
      const { flash, sender, recipient1, recipient2 } =
        await loadFixture(deployFixture);
      await expect(
        flash
          .connect(sender)
          .flash([recipient1.address, recipient2.address], SAMPLE_PAYLOAD, {
            value: PER_RECIPIENT_FEE, // pays for 1, sends to 2
          })
      )
        .to.be.revertedWithCustomError(flash, "WrongFee")
        .withArgs(2n * PER_RECIPIENT_FEE, PER_RECIPIENT_FEE);
    });

    it("reverts WrongFee on overpayment (exact-fee policy, no refunds)", async function () {
      const { flash, sender, recipient1 } = await loadFixture(deployFixture);
      await expect(
        flash.connect(sender).flash([recipient1.address], SAMPLE_PAYLOAD, {
          value: PER_RECIPIENT_FEE + 1n,
        })
      )
        .to.be.revertedWithCustomError(flash, "WrongFee")
        .withArgs(PER_RECIPIENT_FEE, PER_RECIPIENT_FEE + 1n);
    });

    it("fragmenting a broadcast gives no fee advantage (linear moat)", async function () {
      const { flash, sender, recipient1, recipient2, feeReceiver } =
        await loadFixture(deployFixture);
      const feeBalBefore = await ethers.provider.getBalance(feeReceiver.address);

      // One 2-recipient send...
      await flash
        .connect(sender)
        .flash([recipient1.address, recipient2.address], SAMPLE_PAYLOAD, {
          value: 2n * PER_RECIPIENT_FEE,
        });
      // ...vs two 1-recipient sends: identical total fee.
      await flash.connect(sender).flash([recipient1.address], SAMPLE_PAYLOAD, {
        value: PER_RECIPIENT_FEE,
      });
      await flash.connect(sender).flash([recipient2.address], SAMPLE_PAYLOAD, {
        value: PER_RECIPIENT_FEE,
      });

      const feeBalAfter = await ethers.provider.getBalance(feeReceiver.address);
      expect(feeBalAfter - feeBalBefore).to.equal(4n * PER_RECIPIENT_FEE);
    });
  });

  // ──────────────────────────────────────────────────
  //  Fire-and-forget invariants
  // ──────────────────────────────────────────────────
  describe("fire-and-forget", function () {
    it("exposes no mutation, recall, pause, or admin surface", async function () {
      const { flash } = await loadFixture(deployFixture);
      const fragments = flash.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => f.name);

      // The entire external surface: one send function + immutable/read-only views.
      // The D-039 additions (getFlash + sent/received discovery views) are all views —
      // no new mutation, recall, pause, or admin surface.
      expect(fragments.sort()).to.deep.equal(
        [
          "MAX_PAYLOAD_BYTES",
          "MAX_RECIPIENTS",
          "feeReceiver",
          "flash",
          "flashCount",
          "flashFeeFor",
          "getFlash",
          "getReceivedFlashes",
          "getReceivedFlashesPaged",
          "getSentFlashes",
          "getSentFlashesPaged",
          "perRecipientFee",
          "receivedFlashCount",
          "recipientRegistry",
          "sentFlashCount",
        ].sort()
      );
    });

    it("a later ratchet-key rotation does not affect already-sent flashes", async function () {
      const { flash, registry, sender, recipient1 } =
        await loadFixture(deployFixture);
      await flash.connect(sender).flash([recipient1.address], SAMPLE_PAYLOAD, {
        value: PER_RECIPIENT_FEE,
      });

      // Rotate after the send — the sent flash's event log is untouched and
      // flashCount still reflects the send.
      await registry
        .connect(recipient1)
        .setRatchetPubKey("0x02" + "55".repeat(32));
      expect(await flash.flashCount()).to.equal(1);
    });
  });
});
