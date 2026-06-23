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

// D-039: Flash payload lives in canonical state (FlashRecord + getFlash), with sender/recipient
// discovery indexes — so a late or un-indexed recipient can retrieve a flash without relying on
// prunable event logs. Mirrors Beat's #218 discovery, but the recipient index is *exact*
// (Flash is immutable + dedups recipients → no stale/dup, no membership guard needed).
describe("MaktubFlash — canonical state + discovery (D-039)", function () {
  const asArray = (r) => r.map((x) => x);

  async function send(flash, signer, recipientAddrs) {
    const fee = BigInt(recipientAddrs.length) * PER_RECIPIENT_FEE;
    const tx = await flash
      .connect(signer)
      .flash(recipientAddrs, SAMPLE_PAYLOAD, { value: fee });
    const rc = await tx.wait();
    const ev = rc.logs.find((l) => {
      try {
        return flash.interface.parseLog(l)?.name === "FlashSent";
      } catch {
        return false;
      }
    });
    return flash.interface.parseLog(ev).args.id;
  }

  describe("canonical record", function () {
    it("stores the payload in state, retrievable via getFlash (not just the event log)", async function () {
      const { flash, sender, recipient1, recipient2 } = await loadFixture(deployFixture);
      const id = await send(flash, sender, [recipient1.address, recipient2.address]);

      const rec = await flash.getFlash(id);
      expect(rec.sender).to.equal(sender.address);
      expect(asArray(rec.recipients)).to.deep.equal([recipient1.address, recipient2.address]);
      expect(rec.payload).to.equal(ethers.hexlify(SAMPLE_PAYLOAD));
      expect(rec.timestamp).to.be.greaterThan(0n);
    });

    it("reverts getFlash for an id that was never sent", async function () {
      const { flash } = await loadFixture(deployFixture);
      await expect(flash.getFlash(999)).to.be.revertedWithCustomError(flash, "FlashNotFound");
    });

    it("rejects duplicate recipient addresses in one flash", async function () {
      const { flash, sender, recipient1 } = await loadFixture(deployFixture);
      await expect(
        flash
          .connect(sender)
          .flash([recipient1.address, recipient1.address], SAMPLE_PAYLOAD, {
            value: 2n * PER_RECIPIENT_FEE,
          })
      )
        .to.be.revertedWithCustomError(flash, "DuplicateRecipient")
        .withArgs(recipient1.address);
    });
  });

  describe("sender index", function () {
    it("lists every flash a sender sent, in order, with pagination", async function () {
      const { flash, sender, recipient1 } = await loadFixture(deployFixture);
      const ids = [];
      for (let i = 0; i < 3; i++) ids.push(await send(flash, sender, [recipient1.address]));

      expect(await flash.sentFlashCount(sender.address)).to.equal(3);
      expect(asArray(await flash.getSentFlashes(sender.address))).to.deep.equal(ids);
      expect(asArray(await flash.getSentFlashesPaged(sender.address, 1, 2))).to.deep.equal([
        ids[1],
        ids[2],
      ]);
      expect(asArray(await flash.getSentFlashesPaged(sender.address, 2, 10))).to.deep.equal([
        ids[2],
      ]);
      expect(asArray(await flash.getSentFlashesPaged(sender.address, 9, 5))).to.deep.equal([]);
    });
  });

  describe("recipient index (exact)", function () {
    it("records each received flash exactly once — no stale, no duplicates", async function () {
      const { flash, sender, recipient1, recipient2 } = await loadFixture(deployFixture);
      const id0 = await send(flash, sender, [recipient1.address, recipient2.address]);
      const id1 = await send(flash, sender, [recipient1.address]); // r1 again, distinct flash

      expect(await flash.receivedFlashCount(recipient1.address)).to.equal(2);
      expect(asArray(await flash.getReceivedFlashes(recipient1.address))).to.deep.equal([
        id0,
        id1,
      ]);
      expect(await flash.receivedFlashCount(recipient2.address)).to.equal(1);
      expect(asArray(await flash.getReceivedFlashes(recipient2.address))).to.deep.equal([id0]);
    });

    it("griefing is fee-metered: each entry in a victim's index is a distinct paid send", async function () {
      const { flash, sender, recipient1 } = await loadFixture(deployFixture);
      // No free re-add path (Flash has no updateRecipients); every send costs the fee.
      for (let i = 0; i < 3; i++) await send(flash, sender, [recipient1.address]);
      expect(await flash.receivedFlashCount(recipient1.address)).to.equal(3); // 3 paid sends
    });
  });
});
