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

describe("Maktub Protocol — Full Lifecycle: Multi-Executor", function () {
  // ══════════════════════════════════════════════════
  //  SCENARIO 5: Multiple Heartbeats
  // ══════════════════════════════════════════════════
  describe("Scenario 5: Multiple Heartbeats", function () {
    it("should handle multiple heartbeats independently", async function () {
      const { core, registry, rewards, token, alice, bob, charlie, dave } =
        await loadFixture(deployFullProtocol);

      // Register recipients
      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key"));
      await registry.connect(dave).register(ethers.toUtf8Bytes("dave-key"));

      // Stake Charlie as executor
      await token.connect(charlie).approve(await rewards.getAddress(), MINIMUM_STAKE);
      await rewards.connect(charlie).stake(MINIMUM_STAKE);

      // Bob creates two heartbeats with different intervals
      const salt0 = randomSalt();
      await core
        .connect(bob)
        .createHeartbeat(
          salt0,
          [alice.address],
          ethers.toUtf8Bytes("payload-1"),
          ONE_DAY,
          { value: CREATION_FEE }
        );
      const id0 = beatId(bob.address, salt0);

      const salt1 = randomSalt();
      await core
        .connect(bob)
        .createHeartbeat(
          salt1,
          [dave.address],
          ethers.toUtf8Bytes("payload-2"),
          ONE_DAY * 7,
          { value: CREATION_FEE }
        );
      const id1 = beatId(bob.address, salt1);

      expect(await core.heartbeatCount()).to.equal(2);

      // Advance 1 day + 1 second: heartbeat #0 expires, #1 does not
      await time.increase(ONE_DAY + 1);

      expect(await core.isExpired(id0)).to.be.true;
      expect(await core.isExpired(id1)).to.be.false;

      // Execute #0
      await core.connect(charlie).execute(id0);
      const hb0 = await core.getHeartbeat(id0);
      expect(hb0.executed).to.be.true;

      // #1 cannot be executed (not expired)
      await expect(
        core.connect(charlie).execute(id1)
      ).to.be.revertedWithCustomError(core, "TimerNotExpired");

      // #1 is still active
      const hb1 = await core.getHeartbeat(id1);
      expect(hb1.executed).to.be.false;
      expect(hb1.deactivated).to.be.false;
    });
  });

  // ══════════════════════════════════════════════════
  //  SCENARIO 6: Executor Staking Edge Cases
  // ══════════════════════════════════════════════════
  describe("Scenario 6: Executor Staking Edge Cases", function () {
    it("should prevent execution by non-executor (unstaked address)", async function () {
      const { core, registry, alice, bob, dave } =
        await loadFixture(deployFullProtocol);

      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key"));

      const salt = randomSalt();
      await core
        .connect(bob)
        .createHeartbeat(salt, [alice.address], SAMPLE_PAYLOAD, ONE_HOUR, {
          value: CREATION_FEE,
        });
      const id = beatId(bob.address, salt);

      await time.increase(ONE_HOUR + 1);

      // Dave is not staked — should revert
      await expect(
        core.connect(dave).execute(id)
      ).to.be.revertedWithCustomError(core, "NotExecutor");
    });

    it("should deactivate executor who unstakes below minimum", async function () {
      const { rewards, token, charlie } =
        await loadFixture(deployFullProtocol);

      // Charlie stakes 1000
      await token.connect(charlie).approve(await rewards.getAddress(), MINIMUM_STAKE);
      await rewards.connect(charlie).stake(MINIMUM_STAKE);
      expect(await rewards.isActiveExecutor(charlie.address)).to.be.true;

      // Charlie unstakes everything
      await rewards.connect(charlie).unstake(MINIMUM_STAKE);
      expect(await rewards.isActiveExecutor(charlie.address)).to.be.false;
    });

    it("should allow partial stake and then top up to meet minimum", async function () {
      const { rewards, token, charlie } =
        await loadFixture(deployFullProtocol);

      const halfStake = MINIMUM_STAKE / 2n;

      // Stake half — not active yet
      await token.connect(charlie).approve(await rewards.getAddress(), MINIMUM_STAKE);
      await rewards.connect(charlie).stake(halfStake);
      expect(await rewards.isActiveExecutor(charlie.address)).to.be.false;

      // Stake the other half — now active
      await rewards.connect(charlie).stake(halfStake);
      expect(await rewards.isActiveExecutor(charlie.address)).to.be.true;
    });
  });

  // ══════════════════════════════════════════════════
  //  SCENARIO 7: Recipient Registration Edge Cases
  // ══════════════════════════════════════════════════
  describe("Scenario 7: Recipient Registration Edge Cases", function () {
    it("should prevent double registration", async function () {
      const { registry, alice } = await loadFixture(deployFullProtocol);

      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key"));

      await expect(
        registry.connect(alice).register(ethers.toUtf8Bytes("alice-key-v2"))
      ).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
    });

    it("should reject empty PRE public key", async function () {
      const { registry, alice } = await loadFixture(deployFullProtocol);

      await expect(
        registry.connect(alice).register("0x")
      ).to.be.revertedWithCustomError(registry, "EmptyPublicKey");
    });

    it("should allow key rotation via updatePrePublicKey", async function () {
      const { registry, alice } = await loadFixture(deployFullProtocol);

      await registry.connect(alice).register(ethers.toUtf8Bytes("alice-key-v1"));

      const newKey = ethers.toUtf8Bytes("alice-key-v2-rotated");
      await expect(registry.connect(alice).updatePrePublicKey(newKey))
        .to.emit(registry, "PrePublicKeyUpdated")
        .withArgs(alice.address, ethers.hexlify(newKey));

      expect(await registry.getPrePublicKey(alice.address)).to.equal(
        ethers.hexlify(newKey)
      );
    });

    it("should reject key update from unregistered address", async function () {
      const { registry, dave } = await loadFixture(deployFullProtocol);

      await expect(
        registry.connect(dave).updatePrePublicKey(ethers.toUtf8Bytes("new-key"))
      ).to.be.revertedWithCustomError(registry, "NotRegistered");
    });
  });
});
