const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const {
  deployFixture,
  createDefaultHeartbeat,
  registeredRecipients,
  randomSalt,
  beatId,
  CREATION_FEE,
  PER_ADDITIONAL_FEE,
  ONE_HOUR,
  ONE_DAY,
  SAMPLE_PAYLOAD,
} = require("./helpers/maktubCoreFixture");

describe("MaktubCore — boundaries", function () {
  // ──────────────────────────────────────────────────
  //  Input boundaries & limits — every input at min / at-limit / over-limit
  //  with its expected behavior (D-032 / #139).
  // ──────────────────────────────────────────────────
  describe("input boundaries (D-032 limits)", function () {
    describe("recipients", function () {
      it("empty → NoRecipients", async function () {
        const { core, owner } = await loadFixture(deployFixture);
        await expect(
          core.connect(owner).createHeartbeat(randomSalt(), [], SAMPLE_PAYLOAD, ONE_DAY, {
            value: CREATION_FEE,
          })
        ).to.be.revertedWithCustomError(core, "NoRecipients");
      });

      it("exactly MAX_RECIPIENTS (25), all registered → succeeds", async function () {
        const { core, registry, owner, deployer } = await loadFixture(
          deployFixture
        );
        const max = Number(await core.MAX_RECIPIENTS());
        expect(max).to.equal(25);
        const addrs = await registeredRecipients(registry, deployer, max);
        await expect(
          core.connect(owner).createHeartbeat(randomSalt(), addrs, SAMPLE_PAYLOAD, ONE_DAY, {
            value: await core.creationFeeFor(max),
          })
        ).to.emit(core, "HeartbeatCreated");
      });

      it("MAX+1 (26) → TooManyRecipients, checked before registration", async function () {
        const { core, owner } = await loadFixture(deployFixture);
        const max = Number(await core.MAX_RECIPIENTS());
        // 26 UNREGISTERED addresses: a TooManyRecipients revert (not
        // RecipientNotRegistered) proves the count check fires first.
        const tooMany = Array(max + 1).fill(ethers.ZeroAddress);
        await expect(
          core.connect(owner).createHeartbeat(randomSalt(), tooMany, SAMPLE_PAYLOAD, ONE_DAY, {
            value: CREATION_FEE,
          })
        ).to.be.revertedWithCustomError(core, "TooManyRecipients");
      });

      it("updateRecipients honors the same 25 bound", async function () {
        const { core, registry, owner, deployer, recipient1 } =
          await loadFixture(deployFixture);
        const id = await createDefaultHeartbeat(core, owner, [recipient1]);
        const max = Number(await core.MAX_RECIPIENTS());
        const addrs = await registeredRecipients(registry, deployer, max);
        await expect(
          core.connect(owner).updateRecipients(id, addrs)
        ).to.emit(core, "RecipientsUpdated");
        await expect(
          core
            .connect(owner)
            .updateRecipients(id, Array(max + 1).fill(ethers.ZeroAddress))
        ).to.be.revertedWithCustomError(core, "TooManyRecipients");
      });
    });

    describe("payload", function () {
      it("0 bytes → EmptyPayload", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        await expect(
          core
            .connect(owner)
            .createHeartbeat(randomSalt(), [recipient1.address], "0x", ONE_DAY, {
              value: CREATION_FEE,
            })
        ).to.be.revertedWithCustomError(core, "EmptyPayload");
      });

      it("1 byte (min non-empty) → succeeds", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        await expect(
          core
            .connect(owner)
            .createHeartbeat(randomSalt(), [recipient1.address], "0xab", ONE_DAY, {
              value: CREATION_FEE,
            })
        ).to.emit(core, "HeartbeatCreated");
      });

      it("exactly MAX_PAYLOAD_BYTES (4096) → ok; +1 → PayloadTooLarge", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const max = Number(await core.MAX_PAYLOAD_BYTES());
        expect(max).to.equal(4096);
        await expect(
          core
            .connect(owner)
            .createHeartbeat(
              randomSalt(),
              [recipient1.address],
              "0x" + "ab".repeat(max),
              ONE_DAY,
              { value: CREATION_FEE }
            )
        ).to.emit(core, "HeartbeatCreated");
        await expect(
          core
            .connect(owner)
            .createHeartbeat(
              randomSalt(),
              [recipient1.address],
              "0x" + "ab".repeat(max + 1),
              ONE_DAY,
              { value: CREATION_FEE }
            )
        ).to.be.revertedWithCustomError(core, "PayloadTooLarge");
      });
    });

    describe("interval", function () {
      it("exactly MIN and exactly MAX → succeed; one outside each → revert", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const min = await core.MIN_INTERVAL();
        const max = await core.MAX_INTERVAL();
        for (const ok of [min, max]) {
          await expect(
            core
              .connect(owner)
              .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, ok, {
                value: CREATION_FEE,
              })
          ).to.emit(core, "HeartbeatCreated");
        }
        await expect(
          core
            .connect(owner)
            .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, min - 1n, {
              value: CREATION_FEE,
            })
        ).to.be.revertedWithCustomError(core, "IntervalTooShort");
        await expect(
          core
            .connect(owner)
            .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, max + 1n, {
              value: CREATION_FEE,
            })
        ).to.be.revertedWithCustomError(core, "IntervalTooLong");
      });
    });
  });
});
