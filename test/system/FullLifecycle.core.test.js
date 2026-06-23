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

describe("Maktub Protocol — Full Lifecycle: Core", function () {
  // ══════════════════════════════════════════════════
  //  SCENARIO 1: Complete Heartbeat Lifecycle
  // ══════════════════════════════════════════════════
  describe("Scenario 1: Complete Heartbeat Lifecycle", function () {
    it("should complete the full journey from registration to execution", async function () {
      const { core, registry, rewards, token, deployer, alice, bob, charlie, feeReceiver } =
        await loadFixture(deployFullProtocol);

      // ── Step 1: Alice registers as a recipient ──
      const alicePreKey = ethers.toUtf8Bytes("alice-pre-public-key-v1");
      await expect(registry.connect(alice).register(alicePreKey))
        .to.emit(registry, "RecipientRegistered")
        .withArgs(alice.address, ethers.hexlify(alicePreKey));

      expect(await registry.isRegistered(alice.address)).to.be.true;
      expect(await registry.getPrePublicKey(alice.address)).to.equal(
        ethers.hexlify(alicePreKey)
      );

      // ── Step 2: Bob creates a heartbeat for Alice ──
      const feeBalBefore = await ethers.provider.getBalance(feeReceiver.address);

      const salt = randomSalt();
      const tx = await core
        .connect(bob)
        .createHeartbeat(salt, [alice.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        });
      const receipt = await tx.wait();

      // Parse the HeartbeatCreated event
      const createdEvent = receipt.logs.find((log) => {
        try {
          return core.interface.parseLog(log)?.name === "HeartbeatCreated";
        } catch {
          return false;
        }
      });
      const heartbeatId = core.interface.parseLog(createdEvent).args.id;
      expect(heartbeatId).to.equal(beatId(bob.address, salt));

      // Verify heartbeat state
      const hb = await core.getHeartbeat(heartbeatId);
      expect(hb.owner).to.equal(bob.address);
      expect(hb.recipients).to.deep.equal([alice.address]);
      expect(hb.interval).to.equal(ONE_DAY);
      expect(hb.executed).to.be.false;
      expect(hb.deactivated).to.be.false;
      expect(hb.checkInCount).to.equal(0);

      // Fee was collected
      const feeBalAfter = await ethers.provider.getBalance(feeReceiver.address);
      expect(feeBalAfter - feeBalBefore).to.equal(CREATION_FEE);

      // ── Step 3: Bob checks in (timer resets) ──
      await time.increase(ONE_DAY / 2); // half a day passes

      const remainingBefore = await core.timeRemaining(heartbeatId);
      expect(remainingBefore).to.be.lt(BigInt(ONE_DAY)); // some time has passed

      await expect(core.connect(bob).checkIn(heartbeatId))
        .to.emit(core, "HeartbeatCheckedIn");

      const remainingAfter = await core.timeRemaining(heartbeatId);
      expect(remainingAfter).to.be.closeTo(BigInt(ONE_DAY), 5n); // timer reset

      const hbAfterCheckIn = await core.getHeartbeat(heartbeatId);
      expect(hbAfterCheckIn.checkInCount).to.equal(1);

      // ── Step 4: Fast-forward time past the interval ──
      await time.increase(ONE_DAY + 1);

      expect(await core.isExpired(heartbeatId)).to.be.true;
      expect(await core.timeRemaining(heartbeatId)).to.equal(0n);

      // ── Step 5: Charlie stakes MKTB and registers as executor ──
      await token
        .connect(charlie)
        .approve(await rewards.getAddress(), MINIMUM_STAKE);
      await expect(rewards.connect(charlie).stake(MINIMUM_STAKE))
        .to.emit(rewards, "ExecutorStaked")
        .withArgs(charlie.address, MINIMUM_STAKE, MINIMUM_STAKE);

      expect(await rewards.isActiveExecutor(charlie.address)).to.be.true;
      expect(await core.isExecutor(charlie.address)).to.be.true;

      // ── Step 6: Charlie executes the expired heartbeat ──
      await expect(core.connect(charlie).execute(heartbeatId))
        .to.emit(core, "HeartbeatExecuted")
        .withArgs(heartbeatId, charlie.address, await time.latest() + 1);

      const hbExecuted = await core.getHeartbeat(heartbeatId);
      expect(hbExecuted.executed).to.be.true;

      // ── Step 7: Verify cannot execute again (AlreadyExecuted) ──
      await expect(
        core.connect(charlie).execute(heartbeatId)
      ).to.be.revertedWithCustomError(core, "AlreadyExecuted");

      // ── Step 8: Verify cannot check in on executed heartbeat ──
      await expect(
        core.connect(bob).checkIn(heartbeatId)
      ).to.be.revertedWithCustomError(core, "AlreadyExecuted");
    });
  });

  // ══════════════════════════════════════════════════
  //  SCENARIO 2: Deactivation Flow
  // ══════════════════════════════════════════════════
  describe("Scenario 2: Deactivation Flow", function () {
    it("should allow owner to deactivate and block all further actions", async function () {
      const { core, registry, rewards, token, alice, bob, charlie } =
        await loadFixture(deployFullProtocol);

      // Setup: register Alice, stake Charlie
      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key"));
      await token.connect(charlie).approve(await rewards.getAddress(), MINIMUM_STAKE);
      await rewards.connect(charlie).stake(MINIMUM_STAKE);

      // Bob creates heartbeat
      const salt = randomSalt();
      await core
        .connect(bob)
        .createHeartbeat(salt, [alice.address], SAMPLE_PAYLOAD, ONE_DAY, {
          value: CREATION_FEE,
        });
      const id = beatId(bob.address, salt);

      // Bob checks in once
      await time.increase(ONE_HOUR);
      await core.connect(bob).checkIn(id);

      // Bob deactivates
      await expect(core.connect(bob).deactivate(id))
        .to.emit(core, "HeartbeatDeactivated")
        .withArgs(id);

      const hb = await core.getHeartbeat(id);
      expect(hb.deactivated).to.be.true;

      // All actions blocked
      await expect(
        core.connect(bob).checkIn(id)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");

      await time.increase(ONE_DAY + 1);
      await expect(
        core.connect(charlie).execute(id)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");

      await expect(
        core.connect(bob).updateRecipients(id, [alice.address])
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");

      await expect(
        core.connect(bob).updateInterval(id, ONE_DAY * 2)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");

      // Cannot deactivate again
      await expect(
        core.connect(bob).deactivate(id)
      ).to.be.revertedWithCustomError(core, "HeartbeatIsDeactivated");
    });
  });
});
