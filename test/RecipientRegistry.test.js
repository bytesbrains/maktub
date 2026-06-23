const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("RecipientRegistry", function () {
  async function deployFixture() {
    const [deployer, alice, bob] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("RecipientRegistry");
    const registry = await Registry.deploy();
    const sampleKey = ethers.toUtf8Bytes("pre-public-key-alice-123456");
    return { registry, deployer, alice, bob, sampleKey };
  }

  describe("register", function () {
    it("should register a recipient with a valid PRE public key", async function () {
      const { registry, alice, sampleKey } = await loadFixture(deployFixture);
      await expect(registry.connect(alice).register(sampleKey))
        .to.emit(registry, "RecipientRegistered")
        .withArgs(alice.address, ethers.hexlify(sampleKey));
      expect(await registry.isRegistered(alice.address)).to.be.true;
    });

    it("should store the PRE public key", async function () {
      const { registry, alice, sampleKey } = await loadFixture(deployFixture);
      await registry.connect(alice).register(sampleKey);
      const stored = await registry.getPrePublicKey(alice.address);
      expect(stored).to.equal(ethers.hexlify(sampleKey));
    });

    it("should revert if already registered", async function () {
      const { registry, alice, sampleKey } = await loadFixture(deployFixture);
      await registry.connect(alice).register(sampleKey);
      await expect(registry.connect(alice).register(sampleKey))
        .to.be.revertedWithCustomError(registry, "AlreadyRegistered");
    });

    it("should revert if PRE public key is empty", async function () {
      const { registry, alice } = await loadFixture(deployFixture);
      await expect(registry.connect(alice).register("0x"))
        .to.be.revertedWithCustomError(registry, "EmptyPublicKey");
    });

    it("should allow multiple different accounts to register", async function () {
      const { registry, alice, bob, sampleKey } = await loadFixture(deployFixture);
      await registry.connect(alice).register(sampleKey);
      const bobKey = ethers.toUtf8Bytes("pre-public-key-bob-789");
      await registry.connect(bob).register(bobKey);
      expect(await registry.isRegistered(alice.address)).to.be.true;
      expect(await registry.isRegistered(bob.address)).to.be.true;
    });
  });

  describe("isRegistered", function () {
    it("should return false for unregistered address", async function () {
      const { registry, alice } = await loadFixture(deployFixture);
      expect(await registry.isRegistered(alice.address)).to.be.false;
    });
  });

  describe("updatePrePublicKey", function () {
    it("should update PRE public key for registered recipient", async function () {
      const { registry, alice, sampleKey } = await loadFixture(deployFixture);
      await registry.connect(alice).register(sampleKey);

      const newKey = ethers.toUtf8Bytes("new-pre-public-key-alice-rotated");
      await expect(registry.connect(alice).updatePrePublicKey(newKey))
        .to.emit(registry, "PrePublicKeyUpdated")
        .withArgs(alice.address, ethers.hexlify(newKey));

      const stored = await registry.getPrePublicKey(alice.address);
      expect(stored).to.equal(ethers.hexlify(newKey));
    });

    it("should revert with NotRegistered if caller is not registered", async function () {
      const { registry, bob } = await loadFixture(deployFixture);
      const newKey = ethers.toUtf8Bytes("some-key");
      await expect(
        registry.connect(bob).updatePrePublicKey(newKey)
      ).to.be.revertedWithCustomError(registry, "NotRegistered");
    });

    it("should revert with EmptyPublicKey if new key is empty", async function () {
      const { registry, alice, sampleKey } = await loadFixture(deployFixture);
      await registry.connect(alice).register(sampleKey);
      await expect(
        registry.connect(alice).updatePrePublicKey("0x")
      ).to.be.revertedWithCustomError(registry, "EmptyPublicKey");
    });
  });

  describe("getPrePublicKey", function () {
    it("should return empty bytes for unregistered address", async function () {
      const { registry, alice } = await loadFixture(deployFixture);
      const key = await registry.getPrePublicKey(alice.address);
      expect(key).to.equal("0x");
    });
  });
});
