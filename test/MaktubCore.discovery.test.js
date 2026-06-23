const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const {
  deployFixture,
  randomSalt,
  beatId,
  registeredRecipients,
  SAMPLE_PAYLOAD,
  ONE_DAY,
} = require("./helpers/maktubCoreFixture");

// D-038: creator-chosen deterministic ids (`id = keccak256(abi.encode(sender, salt))`)
// + owner/recipient discovery indexes (ids are no longer 0..N enumerable).
describe("MaktubCore — deterministic ids + discovery (D-038)", function () {
  async function create(core, signer, salt, recipientAddrs) {
    const fee = await core.creationFeeFor(recipientAddrs.length);
    return core
      .connect(signer)
      .createHeartbeat(salt, recipientAddrs, SAMPLE_PAYLOAD, ONE_DAY, { value: fee });
  }
  const asArray = (r) => r.map((x) => x); // ethers Result -> plain bigint[]

  describe("deterministic id", function () {
    it("emits and stores the beat under keccak256(sender, salt)", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const salt = randomSalt();
      const id = beatId(owner.address, salt);

      await expect(create(core, owner, salt, [recipient1.address]))
        .to.emit(core, "HeartbeatCreated")
        .withArgs(id, owner.address, [recipient1.address], ONE_DAY);

      const hb = await core.getHeartbeat(id);
      expect(hb.owner).to.equal(owner.address);
    });

    it("reverts when the same creator reuses a salt", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const salt = randomSalt();
      await create(core, owner, salt, [recipient1.address]);

      await expect(
        create(core, owner, salt, [recipient1.address])
      ).to.be.revertedWithCustomError(core, "HeartbeatAlreadyExists");
    });

    it("is front-running-proof: same salt, different sender => different id, both succeed", async function () {
      const { core, owner, stranger, recipient1 } = await loadFixture(deployFixture);
      const salt = randomSalt();

      await create(core, owner, salt, [recipient1.address]);
      await create(core, stranger, salt, [recipient1.address]);

      const idA = beatId(owner.address, salt);
      const idB = beatId(stranger.address, salt);
      expect(idA).to.not.equal(idB);
      expect((await core.getHeartbeat(idA)).owner).to.equal(owner.address);
      expect((await core.getHeartbeat(idB)).owner).to.equal(stranger.address);
    });

    it("reverts getHeartbeat for an id that was never created", async function () {
      const { core } = await loadFixture(deployFixture);
      await expect(core.getHeartbeat(12345)).to.be.revertedWithCustomError(
        core,
        "HeartbeatNotFound"
      );
    });

    it("reverts execute/checkIn for an id that was never created", async function () {
      const { core, owner, executor } = await loadFixture(deployFixture);
      await expect(
        core.connect(executor).execute(999)
      ).to.be.revertedWithCustomError(core, "HeartbeatNotFound");
      await expect(
        core.connect(owner).checkIn(999)
      ).to.be.revertedWithCustomError(core, "HeartbeatNotFound");
    });
  });

  describe("owner index", function () {
    it("lists every beat a creator made, in creation order, with pagination", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const salts = [randomSalt(), randomSalt(), randomSalt()];
      for (const s of salts) await create(core, owner, s, [recipient1.address]);
      const ids = salts.map((s) => beatId(owner.address, s));

      expect(await core.ownerBeatCount(owner.address)).to.equal(3);
      expect(asArray(await core.getOwnerBeats(owner.address))).to.deep.equal(ids);

      // page [1, 3) -> ids[1], ids[2]
      expect(asArray(await core.getOwnerBeatsPaged(owner.address, 1, 2))).to.deep.equal([
        ids[1],
        ids[2],
      ]);
      // end clamps to length
      expect(asArray(await core.getOwnerBeatsPaged(owner.address, 2, 10))).to.deep.equal([
        ids[2],
      ]);
      // start past end -> empty
      expect(asArray(await core.getOwnerBeatsPaged(owner.address, 9, 5))).to.deep.equal([]);
    });
  });

  describe("recipient soft index", function () {
    it("records the beat for each recipient at creation", async function () {
      const { core, owner, registry, deployer } = await loadFixture(deployFixture);
      const [r] = await registeredRecipients(registry, deployer, 1); // fresh, empty inbox
      const salt = randomSalt();
      await create(core, owner, salt, [r]);
      const id = beatId(owner.address, salt);

      expect(await core.inboxCount(r)).to.equal(1);
      expect(asArray(await core.getInboxBeats(r))).to.deep.equal([id]);
    });

    it("keeps a STALE hint for a removed recipient; getHeartbeat is the authority", async function () {
      const { core, owner, registry, deployer } = await loadFixture(deployFixture);
      const [r1, r2] = await registeredRecipients(registry, deployer, 2);
      const salt = randomSalt();
      await create(core, owner, salt, [r1]);
      const id = beatId(owner.address, salt);

      await core.connect(owner).updateRecipients(id, [r2]);

      // r1's index still lists id (stale) — but it is no longer a current recipient.
      expect(asArray(await core.getInboxBeats(r1))).to.include(id);
      expect(asArray(await core.getInboxBeats(r2))).to.include(id);
      const hb = await core.getHeartbeat(id);
      expect(hb.recipients).to.deep.equal([r2]); // current membership = authority
    });

    it("does NOT duplicate a hint when a recipient is re-added (membership guard)", async function () {
      const { core, owner, registry, deployer } = await loadFixture(deployFixture);
      const [r1, r2] = await registeredRecipients(registry, deployer, 2);
      const salt = randomSalt();
      await create(core, owner, salt, [r1]); // r1 indexed once
      const id = beatId(owner.address, salt);

      await core.connect(owner).updateRecipients(id, [r1, r2]); // r1 re-added -> no-op push

      expect(await core.inboxCount(r1)).to.equal(1); // still 1 — no duplicate
      expect(asArray(await core.getInboxBeats(r1))).to.deep.equal([id]);
      expect(await core.inboxCount(r2)).to.equal(1); // r2 newly indexed
      expect((await core.getHeartbeat(id)).recipients).to.deep.equal([r1, r2]);
    });

    it("rejects duplicate recipient addresses in one call", async function () {
      const { core, owner, recipient1 } = await loadFixture(deployFixture);
      const fee = await core.creationFeeFor(2);
      await expect(
        core
          .connect(owner)
          .createHeartbeat(
            randomSalt(),
            [recipient1.address, recipient1.address],
            SAMPLE_PAYLOAD,
            ONE_DAY,
            { value: fee }
          )
      )
        .to.be.revertedWithCustomError(core, "DuplicateRecipient")
        .withArgs(recipient1.address);
    });

    it("bounds inbox griefing: repeated updateRecipients adds no new hints", async function () {
      const { core, owner, registry, deployer } = await loadFixture(deployFixture);
      const [victim, other] = await registeredRecipients(registry, deployer, 2);
      const salt = randomSalt();
      await create(core, owner, salt, [victim]); // victim indexed once
      const id = beatId(owner.address, salt);

      // An attacker who owns the beat re-targets the victim repeatedly (free txs). The
      // membership guard makes each a no-op — the victim's index never grows past 1 per beat.
      for (let i = 0; i < 5; i++) {
        await core.connect(owner).updateRecipients(id, [victim, other]);
      }
      expect(await core.inboxCount(victim)).to.equal(1); // not 6 — bounded
      expect(await core.inboxCount(other)).to.equal(1);
    });
  });
});
