const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const {
  deployFixture,
  PER_RECIPIENT_FEE,
} = require("./helpers/maktubFlashFixture");

describe("MaktubFlash — adversarial", function () {
  // ──────────────────────────────────────────────────
  //  Adversarial — malformed payloads
  // ──────────────────────────────────────────────────
  describe("adversarial (malformed payloads)", function () {
    // Flash never parses the payload — it rides opaquely in the FlashSent event.
    // Prove arbitrary/hostile bytes round-trip byte-identically in the log.
    const malformed = [
      ["all 0xFF (256B)", "0x" + "ff".repeat(256)],
      ["all null bytes (256B)", "0x" + "00".repeat(256)],
      ["single null byte", "0x00"],
      ["selectors + high bytes", "0x" + "a9059cbbfefeff00".repeat(20)],
    ];
    for (const [name, payload] of malformed) {
      it(`FlashSent carries opaque payload, exact round-trip: ${name}`, async function () {
        const { flash, sender, recipient1 } = await loadFixture(deployFixture);
        const tx = await flash
          .connect(sender)
          .flash([recipient1.address], payload, { value: PER_RECIPIENT_FEE });
        const receipt = await tx.wait();
        const ev = receipt.logs
          .map((l) => {
            try {
              return flash.interface.parseLog(l);
            } catch {
              return null;
            }
          })
          .find((p) => p?.name === "FlashSent");
        expect(ev.args.payload).to.equal(payload);
      });
    }
  });
});
