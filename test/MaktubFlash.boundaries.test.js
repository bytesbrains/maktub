const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const {
  deployFixture,
  PER_RECIPIENT_FEE,
  ENC_KEY,
  RATCHET_KEY,
  SAMPLE_PAYLOAD,
} = require("./helpers/maktubFlashFixture");

describe("MaktubFlash — input boundaries", function () {
  // ──────────────────────────────────────────────────
  //  Input boundaries & limits (D-032 / #139)
  // ──────────────────────────────────────────────────
  describe("input boundaries (D-032 limits)", function () {
    // Flash-eligible = registered on v2 with a ratchet key; each recipient
    // registers from their own address, so an at-MAX group is N funded EOAs.
    async function eligibleRecipients(registry, funder, n) {
      const addrs = [];
      for (let i = 0; i < n; i++) {
        const w = ethers.Wallet.createRandom().connect(ethers.provider);
        await funder.sendTransaction({
          to: w.address,
          value: ethers.parseEther("0.05"),
        });
        await registry.connect(w).register(ENC_KEY, RATCHET_KEY);
        addrs.push(w.address);
      }
      return addrs;
    }

    describe("recipients", function () {
      it("empty → NoRecipients", async function () {
        const { flash, sender } = await loadFixture(deployFixture);
        await expect(
          flash.connect(sender).flash([], SAMPLE_PAYLOAD, { value: 0 })
        ).to.be.revertedWithCustomError(flash, "NoRecipients");
      });

      it("exactly MAX_RECIPIENTS (25), all eligible → succeeds", async function () {
        const { flash, registry, sender, deployer } = await loadFixture(
          deployFixture
        );
        const max = Number(await flash.MAX_RECIPIENTS());
        expect(max).to.equal(25);
        const addrs = await eligibleRecipients(registry, deployer, max);
        await expect(
          flash.connect(sender).flash(addrs, SAMPLE_PAYLOAD, {
            value: BigInt(max) * PER_RECIPIENT_FEE,
          })
        ).to.emit(flash, "FlashSent");
      });

      it("MAX+1 (26) → TooManyRecipients, checked before eligibility", async function () {
        const { flash, sender } = await loadFixture(deployFixture);
        const max = Number(await flash.MAX_RECIPIENTS());
        const tooMany = Array(max + 1).fill(ethers.ZeroAddress);
        await expect(
          flash.connect(sender).flash(tooMany, SAMPLE_PAYLOAD, {
            value: BigInt(max + 1) * PER_RECIPIENT_FEE,
          })
        ).to.be.revertedWithCustomError(flash, "TooManyRecipients");
      });
    });

    describe("payload", function () {
      it("0 bytes → EmptyPayload; 1 byte → succeeds", async function () {
        const { flash, sender, recipient1 } = await loadFixture(deployFixture);
        await expect(
          flash
            .connect(sender)
            .flash([recipient1.address], "0x", { value: PER_RECIPIENT_FEE })
        ).to.be.revertedWithCustomError(flash, "EmptyPayload");
        await expect(
          flash
            .connect(sender)
            .flash([recipient1.address], "0xab", { value: PER_RECIPIENT_FEE })
        ).to.emit(flash, "FlashSent");
      });

      it("exactly MAX_PAYLOAD_BYTES (4096) → ok; +1 → PayloadTooLarge", async function () {
        const { flash, sender, recipient1 } = await loadFixture(deployFixture);
        const max = Number(await flash.MAX_PAYLOAD_BYTES());
        expect(max).to.equal(4096);
        await expect(
          flash.connect(sender).flash([recipient1.address], "0x" + "ab".repeat(max), {
            value: PER_RECIPIENT_FEE,
          })
        ).to.emit(flash, "FlashSent");
        await expect(
          flash
            .connect(sender)
            .flash([recipient1.address], "0x" + "ab".repeat(max + 1), {
              value: PER_RECIPIENT_FEE,
            })
        ).to.be.revertedWithCustomError(flash, "PayloadTooLarge");
      });
    });

    describe("fee (exact-fee policy)", function () {
      it("under → WrongFee; over → WrongFee; exact → succeeds", async function () {
        const { flash, sender, recipient1 } = await loadFixture(deployFixture);
        await expect(
          flash
            .connect(sender)
            .flash([recipient1.address], SAMPLE_PAYLOAD, {
              value: PER_RECIPIENT_FEE - 1n,
            })
        ).to.be.revertedWithCustomError(flash, "WrongFee");
        await expect(
          flash
            .connect(sender)
            .flash([recipient1.address], SAMPLE_PAYLOAD, {
              value: PER_RECIPIENT_FEE + 1n,
            })
        ).to.be.revertedWithCustomError(flash, "WrongFee");
        await expect(
          flash
            .connect(sender)
            .flash([recipient1.address], SAMPLE_PAYLOAD, {
              value: PER_RECIPIENT_FEE,
            })
        ).to.emit(flash, "FlashSent");
      });
    });

    describe("combined (recipients × payload corner)", function () {
      it("max recipients (25) × max payload (4096) → succeeds; +1 → PayloadTooLarge", async function () {
        const { flash, registry, sender, deployer } = await loadFixture(
          deployFixture
        );
        const maxR = Number(await flash.MAX_RECIPIENTS());
        const maxP = Number(await flash.MAX_PAYLOAD_BYTES());
        const addrs = await eligibleRecipients(registry, deployer, maxR);
        const fee = BigInt(maxR) * PER_RECIPIENT_FEE;
        // Both caps maxed at once — independent bounds; the app-layer
        // maxMessageBytes(N) is what relates them (#139 §4).
        await expect(
          flash.connect(sender).flash(addrs, "0x" + "cd".repeat(maxP), { value: fee })
        ).to.emit(flash, "FlashSent");
        await expect(
          flash
            .connect(sender)
            .flash(addrs, "0x" + "cd".repeat(maxP + 1), { value: fee })
        ).to.be.revertedWithCustomError(flash, "PayloadTooLarge");
      });
    });
  });
});
