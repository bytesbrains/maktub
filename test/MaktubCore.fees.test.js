const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const {
  deployFixture,
  createDefaultHeartbeat,
  randomSalt,
  CREATION_FEE,
  PER_ADDITIONAL_FEE,
  ONE_HOUR,
  ONE_DAY,
  SAMPLE_PAYLOAD,
} = require("./helpers/maktubCoreFixture");

describe("MaktubCore — fees & race", function () {
  // ──────────────────────────────────────────────────
  //  Fee curve (D-022 / D-023): base + (N-1) × perAdditional
  // ──────────────────────────────────────────────────
  describe("creationFeeFor", function () {
    it("returns baseFee for a single recipient", async function () {
      const { core } = await loadFixture(deployFixture);
      expect(await core.creationFeeFor(1)).to.equal(CREATION_FEE);
    });

    it("scales linearly per additional recipient", async function () {
      const { core } = await loadFixture(deployFixture);
      expect(await core.creationFeeFor(2)).to.equal(
        CREATION_FEE + PER_ADDITIONAL_FEE
      );
      expect(await core.creationFeeFor(100)).to.equal(
        CREATION_FEE + 99n * PER_ADDITIONAL_FEE
      );
    });

    it("reverts with NoRecipients for a zero recipient count", async function () {
      const { core } = await loadFixture(deployFixture);
      await expect(core.creationFeeFor(0)).to.be.revertedWithCustomError(
        core,
        "NoRecipients"
      );
    });

    it("charges the curve fee on multi-recipient creation and refunds excess", async function () {
      const { core, owner, recipient1, recipient2, feeReceiver } =
        await loadFixture(deployFixture);
      const fee = CREATION_FEE + PER_ADDITIONAL_FEE; // 2 recipients
      const excess = ethers.parseEther("0.001");

      const feeBalBefore = await ethers.provider.getBalance(feeReceiver.address);
      const balBefore = await ethers.provider.getBalance(owner.address);

      const tx = await core
        .connect(owner)
        .createHeartbeat(
          randomSalt(),
          [recipient1.address, recipient2.address],
          SAMPLE_PAYLOAD,
          ONE_DAY,
          { value: fee + excess }
        );
      const receipt = await tx.wait();
      const gasCost = receipt.fee;

      const feeBalAfter = await ethers.provider.getBalance(feeReceiver.address);
      const balAfter = await ethers.provider.getBalance(owner.address);

      expect(feeBalAfter - feeBalBefore).to.equal(fee);
      expect(balBefore - balAfter - gasCost).to.equal(fee);
    });

    it("reverts with InsufficientFee when paying base only for two recipients", async function () {
      const { core, owner, recipient1, recipient2 } =
        await loadFixture(deployFixture);
      await expect(
        core
          .connect(owner)
          .createHeartbeat(
            randomSalt(),
            [recipient1.address, recipient2.address],
            SAMPLE_PAYLOAD,
            ONE_DAY,
            { value: CREATION_FEE }
          )
      ).to.be.revertedWithCustomError(core, "InsufficientFee");
    });
  });

  // ──────────────────────────────────────────────────
  //  Multi-executor race (issue #5): one heartbeat, five
  //  staked executors competing — exactly one execution
  //  lands, the rest fail fast with AlreadyExecuted.
  // ──────────────────────────────────────────────────
  describe("multi-executor race", function () {
    it("lets exactly one of five executors execute; losers revert AlreadyExecuted", async function () {
      const { core, rewards, token, owner, executor, recipient1 } =
        await loadFixture(deployFixture);
      const MINIMUM_STAKE = ethers.parseEther("1000");

      // Stake four more executors alongside the fixture's one.
      const signers = await ethers.getSigners();
      const extraExecutors = signers.slice(10, 14);
      for (const ex of extraExecutors) {
        await token.mint(ex.address, MINIMUM_STAKE);
        await token.connect(ex).approve(await rewards.getAddress(), MINIMUM_STAKE);
        await rewards.connect(ex).stake(MINIMUM_STAKE);
      }
      const racers = [executor, ...extraExecutors];
      for (const r of racers) {
        expect(await rewards.isActiveExecutor(r.address)).to.be.true;
      }

      const id = await createDefaultHeartbeat(core, owner, [recipient1]);
      await time.increase(ONE_DAY + 1);

      // All five submit execute() in rapid succession (serialized by the
      // test runner — the assertion is about contract behavior, not mempool
      // ordering). The first lands; the other four must fail fast on the
      // cheap AlreadyExecuted guard, never with a deeper revert.
      let winners = 0;
      for (const r of racers) {
        try {
          const tx = await core.connect(r).execute(id);
          await tx.wait();
          winners += 1;
        } catch (e) {
          expect(e.message).to.include("AlreadyExecuted");
        }
      }

      expect(winners).to.equal(1);
      const hb = await core.getHeartbeat(id);
      expect(hb.executed).to.be.true;
    });
  });
});
