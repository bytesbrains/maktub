const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("RecipientRegistryV2", function () {
  // Plausibly-shaped secp256k1 keys (length is what the registry validates;
  // on-curve checks happen client-side at encryption time).
  const COMPRESSED_KEY = "0x02" + "11".repeat(32); // 33 bytes
  const UNCOMPRESSED_KEY = "0x04" + "22".repeat(64); // 65 bytes
  const RATCHET_KEY = "0x03" + "33".repeat(32); // 33 bytes
  const RATCHET_KEY_2 = "0x02" + "44".repeat(32); // 33 bytes
  const BAD_KEY_SHORT = "0x02" + "11".repeat(31); // 32 bytes
  const BAD_KEY_LONG = "0x04" + "22".repeat(65); // 66 bytes
  const BAD_PREFIX_COMPRESSED = "0x05" + "11".repeat(32); // 33 bytes, bad prefix
  const BAD_PREFIX_UNCOMPRESSED = "0x02" + "22".repeat(64); // 65 bytes, bad prefix
  const EXT_TYPE = ethers.keccak256(
    ethers.toUtf8Bytes("maktub.keytype.v1.pq-mlkem768")
  );

  async function deployFixture() {
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const V1 = await ethers.getContractFactory("RecipientRegistry");
    const v1 = await V1.deploy();

    const V2 = await ethers.getContractFactory("RecipientRegistryV2");
    const v2 = await V2.deploy(await v1.getAddress());

    return { v1, v2, deployer, alice, bob, carol };
  }

  // ──────────────────────────────────────────────────
  //  Deployment
  // ──────────────────────────────────────────────────
  describe("deployment", function () {
    it("wires the immutable v1 fall-through", async function () {
      const { v1, v2 } = await loadFixture(deployFixture);
      expect(await v2.v1()).to.equal(await v1.getAddress());
    });

    it("reverts on a zero v1 address", async function () {
      const V2 = await ethers.getContractFactory("RecipientRegistryV2");
      await expect(V2.deploy(ethers.ZeroAddress)).to.be.revertedWith(
        "V1 registry cannot be zero"
      );
    });
  });

  // ──────────────────────────────────────────────────
  //  register
  // ──────────────────────────────────────────────────
  describe("register", function () {
    it("registers with enc key only (Beat-only, not Flash-eligible)", async function () {
      const { v2, alice } = await loadFixture(deployFixture);

      await expect(v2.connect(alice).register(COMPRESSED_KEY, "0x"))
        .to.emit(v2, "RecipientRegisteredV2")
        .withArgs(alice.address, COMPRESSED_KEY, "0x");

      expect(await v2.isRegisteredV2(alice.address)).to.be.true;
      expect(await v2.isFlashEligible(alice.address)).to.be.false;
      expect(await v2.getEncPubKey(alice.address)).to.equal(COMPRESSED_KEY);
      expect(await v2.getRatchetPubKey(alice.address)).to.equal("0x");
    });

    it("registers with both keys (Flash opt-in)", async function () {
      const { v2, alice } = await loadFixture(deployFixture);

      await v2.connect(alice).register(UNCOMPRESSED_KEY, RATCHET_KEY);

      expect(await v2.isFlashEligible(alice.address)).to.be.true;
      expect(await v2.getEncPubKey(alice.address)).to.equal(UNCOMPRESSED_KEY);
      expect(await v2.getRatchetPubKey(alice.address)).to.equal(RATCHET_KEY);
    });

    it("records update timestamps", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await v2.connect(alice).register(COMPRESSED_KEY, RATCHET_KEY);
      const now = BigInt(await time.latest());

      const rec = await v2.getRecipient(alice.address);
      expect(rec.encUpdatedAt).to.equal(now);
      expect(rec.ratchetUpdatedAt).to.equal(now);
    });

    it("reverts on double registration", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await v2.connect(alice).register(COMPRESSED_KEY, "0x");
      await expect(
        v2.connect(alice).register(COMPRESSED_KEY, "0x")
      ).to.be.revertedWithCustomError(v2, "AlreadyRegistered");
    });

    it("accepts 33-byte and 65-byte enc keys, rejects other lengths (issue #20)", async function () {
      const { v2, alice, bob, carol } = await loadFixture(deployFixture);

      await expect(v2.connect(alice).register(COMPRESSED_KEY, "0x")).to.not.be
        .reverted;
      await expect(v2.connect(bob).register(UNCOMPRESSED_KEY, "0x")).to.not.be
        .reverted;

      await expect(v2.connect(carol).register(BAD_KEY_SHORT, "0x"))
        .to.be.revertedWithCustomError(v2, "InvalidKeyLength")
        .withArgs(32);
      await expect(v2.connect(carol).register(BAD_KEY_LONG, "0x"))
        .to.be.revertedWithCustomError(v2, "InvalidKeyLength")
        .withArgs(66);
      await expect(v2.connect(carol).register("0x", "0x"))
        .to.be.revertedWithCustomError(v2, "InvalidKeyLength")
        .withArgs(0);
    });

    it("rejects a malformed ratchet key at registration", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await expect(v2.connect(alice).register(COMPRESSED_KEY, BAD_KEY_SHORT))
        .to.be.revertedWithCustomError(v2, "InvalidKeyLength")
        .withArgs(32);
    });

    it("rejects right-length keys with the wrong prefix byte", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await expect(v2.connect(alice).register(BAD_PREFIX_COMPRESSED, "0x"))
        .to.be.revertedWithCustomError(v2, "InvalidKeyPrefix")
        .withArgs("0x05");
      await expect(v2.connect(alice).register(BAD_PREFIX_UNCOMPRESSED, "0x"))
        .to.be.revertedWithCustomError(v2, "InvalidKeyPrefix")
        .withArgs("0x02");
    });
  });

  // ──────────────────────────────────────────────────
  //  Key rotation (issue #30, protocol leg)
  // ──────────────────────────────────────────────────
  describe("key rotation", function () {
    it("rotates the enc key and bumps its timestamp", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await v2.connect(alice).register(COMPRESSED_KEY, "0x");
      const before = (await v2.getRecipient(alice.address)).encUpdatedAt;

      await time.increase(3600);
      await expect(v2.connect(alice).setEncPubKey(UNCOMPRESSED_KEY))
        .to.emit(v2, "EncPubKeyUpdated")
        .withArgs(alice.address, UNCOMPRESSED_KEY);

      const rec = await v2.getRecipient(alice.address);
      expect(rec.encPubKey).to.equal(UNCOMPRESSED_KEY);
      expect(rec.encUpdatedAt).to.be.greaterThan(before);
    });

    it("ratchet key can be added after registration (late Flash opt-in)", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await v2.connect(alice).register(COMPRESSED_KEY, "0x");
      expect(await v2.isFlashEligible(alice.address)).to.be.false;

      await expect(v2.connect(alice).setRatchetPubKey(RATCHET_KEY))
        .to.emit(v2, "RatchetPubKeyUpdated")
        .withArgs(alice.address, RATCHET_KEY);

      expect(await v2.isFlashEligible(alice.address)).to.be.true;
    });

    it("rotates the ratchet key independently of the enc key", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await v2.connect(alice).register(COMPRESSED_KEY, RATCHET_KEY);

      await v2.connect(alice).setRatchetPubKey(RATCHET_KEY_2);

      expect(await v2.getRatchetPubKey(alice.address)).to.equal(RATCHET_KEY_2);
      expect(await v2.getEncPubKey(alice.address)).to.equal(COMPRESSED_KEY);
    });

    it("reverts rotation for unregistered callers", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await expect(
        v2.connect(alice).setEncPubKey(COMPRESSED_KEY)
      ).to.be.revertedWithCustomError(v2, "NotRegistered");
      await expect(
        v2.connect(alice).setRatchetPubKey(RATCHET_KEY)
      ).to.be.revertedWithCustomError(v2, "NotRegistered");
    });

    it("validates lengths on rotation", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await v2.connect(alice).register(COMPRESSED_KEY, "0x");
      await expect(
        v2.connect(alice).setEncPubKey(BAD_KEY_LONG)
      ).to.be.revertedWithCustomError(v2, "InvalidKeyLength");
      await expect(
        v2.connect(alice).setRatchetPubKey(BAD_KEY_SHORT)
      ).to.be.revertedWithCustomError(v2, "InvalidKeyLength");
    });

    it("clearing the ratchet key opts out of Flash (compromise remediation)", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await v2.connect(alice).register(COMPRESSED_KEY, RATCHET_KEY);
      expect(await v2.isFlashEligible(alice.address)).to.be.true;

      await expect(v2.connect(alice).setRatchetPubKey("0x"))
        .to.emit(v2, "RatchetPubKeyUpdated")
        .withArgs(alice.address, "0x");

      expect(await v2.isFlashEligible(alice.address)).to.be.false;
      expect(await v2.getRatchetPubKey(alice.address)).to.equal("0x");
      // The enc key (and Beat addressability) is untouched.
      expect(await v2.getEncPubKey(alice.address)).to.equal(COMPRESSED_KEY);
    });
  });

  // ──────────────────────────────────────────────────
  //  Extension keys
  // ──────────────────────────────────────────────────
  describe("extension keys", function () {
    it("stores and rotates a namespaced extension key", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await v2.connect(alice).register(COMPRESSED_KEY, "0x");

      const pqKey = "0x" + "ab".repeat(100); // arbitrary format — apps define it
      await expect(v2.connect(alice).setExtKey(EXT_TYPE, pqKey))
        .to.emit(v2, "ExtKeyUpdated")
        .withArgs(alice.address, EXT_TYPE, pqKey);

      expect(await v2.getExtKey(alice.address, EXT_TYPE)).to.equal(pqKey);
      expect(await v2.extKeyUpdatedAt(alice.address, EXT_TYPE)).to.equal(
        BigInt(await time.latest())
      );
    });

    it("reverts for unregistered callers", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await expect(
        v2.connect(alice).setExtKey(EXT_TYPE, "0x1234")
      ).to.be.revertedWithCustomError(v2, "NotRegistered");
    });

    it("empty bytes deletes the extension key (revocation)", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      await v2.connect(alice).register(COMPRESSED_KEY, "0x");

      const pqKey = "0x" + "cd".repeat(64);
      await v2.connect(alice).setExtKey(EXT_TYPE, pqKey);
      expect(await v2.getExtKey(alice.address, EXT_TYPE)).to.equal(pqKey);

      await expect(v2.connect(alice).setExtKey(EXT_TYPE, "0x"))
        .to.emit(v2, "ExtKeyUpdated")
        .withArgs(alice.address, EXT_TYPE, "0x");

      expect(await v2.getExtKey(alice.address, EXT_TYPE)).to.equal("0x");
      // The timestamp still bumps so watchers can detect the revocation.
      expect(await v2.extKeyUpdatedAt(alice.address, EXT_TYPE)).to.be.greaterThan(0);
    });

    it("returns empty bytes and zero timestamp for unset keys", async function () {
      const { v2, alice } = await loadFixture(deployFixture);
      expect(await v2.getExtKey(alice.address, EXT_TYPE)).to.equal("0x");
      expect(await v2.extKeyUpdatedAt(alice.address, EXT_TYPE)).to.equal(0);
    });
  });

  // ──────────────────────────────────────────────────
  //  v1 fall-through (Beat backward compatibility)
  // ──────────────────────────────────────────────────
  describe("v1 fall-through", function () {
    it("getEncPubKey falls through to v1 for Beat-only recipients", async function () {
      const { v1, v2, bob } = await loadFixture(deployFixture);
      const v1Key = ethers.hexlify(ethers.toUtf8Bytes("legacy-v1-pre-key"));
      await v1.connect(bob).register(v1Key);

      // Bob never registered on v2 — Beat-addressable via fall-through.
      expect(await v2.isRegisteredV2(bob.address)).to.be.false;
      expect(await v2.isRegistered(bob.address)).to.be.true;
      expect(await v2.getEncPubKey(bob.address)).to.equal(v1Key);
      // But NOT Flash-eligible: v1 has no ratchet keys.
      expect(await v2.isFlashEligible(bob.address)).to.be.false;
    });

    it("a v2 registration shadows the v1 record", async function () {
      const { v1, v2, bob } = await loadFixture(deployFixture);
      const v1Key = ethers.hexlify(ethers.toUtf8Bytes("legacy-v1-pre-key"));
      await v1.connect(bob).register(v1Key);
      await v2.connect(bob).register(COMPRESSED_KEY, RATCHET_KEY);

      expect(await v2.getEncPubKey(bob.address)).to.equal(COMPRESSED_KEY);
    });

    it("returns empty bytes for addresses unknown to both registries", async function () {
      const { v2, carol } = await loadFixture(deployFixture);
      expect(await v2.getEncPubKey(carol.address)).to.equal("0x");
      expect(await v2.isRegistered(carol.address)).to.be.false;
    });
  });
});
