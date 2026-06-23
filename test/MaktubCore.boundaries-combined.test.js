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

describe("MaktubCore — boundaries combined & adversarial", function () {
  // ──────────────────────────────────────────────────
  //  Input boundaries & limits — every input at min / at-limit / over-limit
  //  with its expected behavior (D-032 / #139).
  // ──────────────────────────────────────────────────
  describe("input boundaries (D-032 limits)", function () {
    describe("fee", function () {
      it("below curve → InsufficientFee; excess → forwarded fee exact, rest refunded", async function () {
        const { core, owner, recipient1, feeReceiver } = await loadFixture(
          deployFixture
        );
        const fee = await core.creationFeeFor(1);
        await expect(
          core
            .connect(owner)
            .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, ONE_DAY, {
              value: fee - 1n,
            })
        ).to.be.revertedWithCustomError(core, "InsufficientFee");

        const before = await ethers.provider.getBalance(feeReceiver.address);
        await core
          .connect(owner)
          .createHeartbeat(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, ONE_DAY, {
            value: fee + ethers.parseEther("0.01"),
          });
        const after = await ethers.provider.getBalance(feeReceiver.address);
        expect(after - before).to.equal(fee); // excess refunded, not forwarded
      });
    });

    describe("combined (recipients × payload corner)", function () {
      it("max recipients (25) × max payload (4096) → succeeds; +1 byte → PayloadTooLarge", async function () {
        const { core, registry, owner, deployer } = await loadFixture(
          deployFixture
        );
        const maxR = Number(await core.MAX_RECIPIENTS());
        const maxP = Number(await core.MAX_PAYLOAD_BYTES());
        const addrs = await registeredRecipients(registry, deployer, maxR);
        const fee = await core.creationFeeFor(maxR);
        // Both limits maxed at once — the worst-case corner — is valid: the
        // contract caps recipients and payload INDEPENDENTLY. The recipients×
        // message-size tradeoff (the envelope overhead eating into the budget)
        // is an app-layer concern (maxMessageBytes(N), #139 §4), not enforced here.
        await expect(
          core
            .connect(owner)
            .createHeartbeat(randomSalt(), addrs, "0x" + "cd".repeat(maxP), ONE_DAY, {
              value: fee,
            })
        ).to.emit(core, "HeartbeatCreated");
        await expect(
          core
            .connect(owner)
            .createHeartbeat(randomSalt(), addrs, "0x" + "cd".repeat(maxP + 1), ONE_DAY, {
              value: fee,
            })
        ).to.be.revertedWithCustomError(core, "PayloadTooLarge");
      });

      it("the two caps are independent — neither relaxes the other", async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const maxP = Number(await core.MAX_PAYLOAD_BYTES());
        const maxR = Number(await core.MAX_RECIPIENTS());
        // over-recipients with a tiny payload still rejects on recipients
        await expect(
          core
            .connect(owner)
            .createHeartbeat(randomSalt(), Array(maxR + 2).fill(ethers.ZeroAddress), "0xab", ONE_DAY, {
              value: CREATION_FEE,
            })
        ).to.be.revertedWithCustomError(core, "TooManyRecipients");
        // a single recipient with an over-payload still rejects on payload
        await expect(
          core
            .connect(owner)
            .createHeartbeat(
              randomSalt(),
              [recipient1.address],
              "0x" + "ab".repeat(maxP + 1),
              ONE_DAY,
              { value: CREATION_FEE }
            )
        ).to.be.revertedWithCustomError(core, "PayloadTooLarge");
      });
    });
  });

  // ──────────────────────────────────────────────────
  //  Adversarial — malformed payloads & injection attempts
  // ──────────────────────────────────────────────────
  describe("adversarial (malformed payloads & injection)", function () {
    // The contract treats `payload` as OPAQUE bytes — it never parses, decodes,
    // delegatecalls, or otherwise interprets it. These prove arbitrary/hostile
    // byte patterns are stored faithfully (exact round-trip) and cannot inject
    // behavior, while the empty/size bounds still hold.
    const malformed = [
      ["all 0xFF (256B)", "0x" + "ff".repeat(256)],
      ["all null bytes (256B)", "0x" + "00".repeat(256)],
      ["single null byte", "0x00"],
      ["control + high bytes", "0x" + "0001020308090a0d1b7ffefeff00".repeat(8)],
      ["ERC20 transfer() selectors ×64", "0x" + "a9059cbb".repeat(64)],
      [
        "fake CID text",
        ethers.hexlify(ethers.toUtf8Bytes("bafyfakecidnotreal-".repeat(3))),
      ],
      ["this contract's selector + addr-like bytes", "0x" + "1cff79cd".repeat(32)],
    ];

    for (const [name, payload] of malformed) {
      it(`stores opaque, round-trips exactly, no parsing: ${name}`, async function () {
        const { core, owner, recipient1 } = await loadFixture(deployFixture);
        const salt = randomSalt();
        await core
          .connect(owner)
          .createHeartbeat(salt, [recipient1.address], payload, ONE_DAY, {
            value: CREATION_FEE,
          });
        const id = beatId(owner.address, salt);
        const hb = await core.getHeartbeat(id);
        // Stored byte-identical to what went in — never reinterpreted.
        expect(hb.payload).to.equal(payload);
        // And it changed nothing else: the heartbeat is a normal, active beat.
        expect(hb.executed).to.be.false;
        expect(hb.deactivated).to.be.false;
        expect(hb.owner).to.equal(owner.address);
      });
    }

    it("an oversize hostile payload reverts on SIZE, not content", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const maxP = Number(await core.MAX_PAYLOAD_BYTES());
      await expect(
        core
          .connect(owner)
          .createHeartbeat(
            randomSalt(),
            [recipient1.address],
            "0x" + "ff".repeat(maxP + 1),
            ONE_DAY,
            { value: CREATION_FEE }
          )
      ).to.be.revertedWithCustomError(core, "PayloadTooLarge");
    });

    it("createHeartbeat cannot be re-entered from the excess-ETH refund", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const Attacker = await ethers.getContractFactory("ReentrantCreator");
      const attacker = await Attacker.connect(owner).deploy(
        await core.getAddress()
      );
      await attacker.arm(randomSalt(), [recipient1.address], SAMPLE_PAYLOAD, ONE_DAY);
      const fee = await core.creationFeeFor(1);
      // Excess value → a refund fires → the attacker's receive() re-enters.
      await attacker.attack({ value: fee + ethers.parseEther("0.01") });
      // The re-entrant path WAS taken...
      expect(await attacker.reenteredAttempted()).to.be.true;
      // ...but the guard blocked it, so exactly ONE heartbeat exists (not two).
      expect(await core.heartbeatCount()).to.equal(1n);
    });
  });
});
