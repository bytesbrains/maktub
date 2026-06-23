const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// SW-1 deployment-only tests for MaktubSmartWallet + MaktubSmartWalletFactory.
//
// Full P-256 / WebAuthn signature validation tests will land in SW-3
// (WebAuthn library fixtures + RIP-7212 precompile tests) and SW-4
// (end-to-end passkey signing). This file proves the foundation:
// the factory deploys clones, addresses are counterfactually predictable,
// and one-time initialization works as designed.

describe("MaktubSmartWallet (SW-1: deployment + factory)", function () {
  // Two arbitrary non-zero 32-byte values. NOT a valid on-curve P-256 point —
  // but neither the factory nor initialize() perform on-curve validation
  // (that happens inside P256.verify when a signature is checked). For
  // deployment-only tests this is sufficient.
  const OWNER_X = "0x" + "11".repeat(32);
  const OWNER_Y = "0x" + "22".repeat(32);
  const OWNER_X_ALT = "0x" + "33".repeat(32);
  const OWNER_Y_ALT = "0x" + "44".repeat(32);

  // Canonical ERC-4337 v0.7 EntryPoint (pinned in MaktubSmartWallet).
  const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

  async function deployFactoryFixture() {
    const [deployer, alice, bob, carol] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MaktubSmartWalletFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();
    const Wallet = await ethers.getContractFactory("MaktubSmartWallet");
    return { factory, Wallet, deployer, alice, bob, carol };
  }

  describe("Factory construction", function () {
    it("deploys an implementation in its constructor", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const impl = await factory.implementation();
      expect(impl).to.properAddress;
      expect(impl).to.not.equal(ethers.ZeroAddress);

      const code = await ethers.provider.getCode(impl);
      expect(code).to.not.equal("0x");
    });

    it("locks the implementation against direct initialization", async function () {
      const { factory, Wallet } = await loadFixture(deployFactoryFixture);
      const impl = Wallet.attach(await factory.implementation());

      // Constructor pre-sets owner to (1, 1) — any further initialize must revert.
      await expect(impl.initialize(OWNER_X, OWNER_Y)).to.be.revertedWithCustomError(
        impl,
        "AlreadyInitialized"
      );
    });
  });

  describe("Counterfactual address prediction", function () {
    it("predictAddress() returns a deterministic address before deploy", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const predicted = await factory.predictAddress(OWNER_X, OWNER_Y, 0);
      expect(predicted).to.properAddress;
      expect(predicted).to.not.equal(ethers.ZeroAddress);

      // No code at the predicted address yet.
      const code = await ethers.provider.getCode(predicted);
      expect(code).to.equal("0x");
    });

    it("predictAddress() is a pure function of (ownerX, ownerY, salt)", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const a = await factory.predictAddress(OWNER_X, OWNER_Y, 0);
      const b = await factory.predictAddress(OWNER_X, OWNER_Y, 0);
      expect(a).to.equal(b);
    });

    it("different salts yield different addresses for the same pubkey", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const a = await factory.predictAddress(OWNER_X, OWNER_Y, 0);
      const b = await factory.predictAddress(OWNER_X, OWNER_Y, 1);
      expect(a).to.not.equal(b);
    });

    it("different pubkeys yield different addresses for the same salt", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const a = await factory.predictAddress(OWNER_X, OWNER_Y, 0);
      const b = await factory.predictAddress(OWNER_X_ALT, OWNER_Y_ALT, 0);
      expect(a).to.not.equal(b);
    });
  });

  describe("createAccount", function () {
    it("deploys a wallet at the predicted address", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const predicted = await factory.predictAddress(OWNER_X, OWNER_Y, 0);

      await expect(factory.createAccount(OWNER_X, OWNER_Y, 0))
        .to.emit(factory, "WalletDeployed")
        .withArgs(predicted, OWNER_X, OWNER_Y, 0);

      const code = await ethers.provider.getCode(predicted);
      expect(code).to.not.equal("0x");
    });

    it("emits OwnerInitialized with the supplied pubkey", async function () {
      const { factory, Wallet } = await loadFixture(deployFactoryFixture);
      const predicted = await factory.predictAddress(OWNER_X, OWNER_Y, 0);

      const tx = await factory.createAccount(OWNER_X, OWNER_Y, 0);
      const receipt = await tx.wait();

      // Find the OwnerInitialized log emitted by the wallet itself.
      const wallet = Wallet.attach(predicted);
      const topic = wallet.interface.getEvent("OwnerInitialized").topicHash;
      const initLog = receipt.logs.find(
        (l) =>
          l.address.toLowerCase() === predicted.toLowerCase() &&
          l.topics[0] === topic
      );
      expect(initLog, "OwnerInitialized log not found").to.exist;

      const parsed = wallet.interface.parseLog(initLog);
      expect(parsed.args.ownerX).to.equal(OWNER_X);
      expect(parsed.args.ownerY).to.equal(OWNER_Y);
    });

    it("stores the owner pubkey on the deployed wallet", async function () {
      const { factory, Wallet } = await loadFixture(deployFactoryFixture);
      await factory.createAccount(OWNER_X, OWNER_Y, 0);

      const wallet = Wallet.attach(await factory.predictAddress(OWNER_X, OWNER_Y, 0));
      const [x, y] = await wallet.owner();
      expect(x).to.equal(OWNER_X);
      expect(y).to.equal(OWNER_Y);
    });

    it("pins the canonical ERC-4337 v0.7 EntryPoint", async function () {
      const { factory, Wallet } = await loadFixture(deployFactoryFixture);
      await factory.createAccount(OWNER_X, OWNER_Y, 0);

      const wallet = Wallet.attach(await factory.predictAddress(OWNER_X, OWNER_Y, 0));
      expect(await wallet.entryPoint()).to.equal(ENTRY_POINT_V07);
    });

    it("exposes name() and version()", async function () {
      const { factory, Wallet } = await loadFixture(deployFactoryFixture);
      await factory.createAccount(OWNER_X, OWNER_Y, 0);
      const wallet = Wallet.attach(await factory.predictAddress(OWNER_X, OWNER_Y, 0));

      expect(await wallet.name()).to.equal("Maktub Smart Wallet v1");
      expect(await wallet.version()).to.equal("1.0.0");
    });

    it("is idempotent: a second call returns the same wallet", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const predicted = await factory.predictAddress(OWNER_X, OWNER_Y, 0);

      await factory.createAccount(OWNER_X, OWNER_Y, 0);
      // Second call MUST NOT revert and MUST NOT redeploy.
      await expect(factory.createAccount(OWNER_X, OWNER_Y, 0)).to.not.be.reverted;

      const code = await ethers.provider.getCode(predicted);
      expect(code).to.not.equal("0x");
    });

    it("forwards msg.value into the deployed wallet (first-deploy funding)", async function () {
      const { factory, alice } = await loadFixture(deployFactoryFixture);
      const predicted = await factory.predictAddress(OWNER_X, OWNER_Y, 0);
      const funding = ethers.parseEther("0.5");

      await factory.connect(alice).createAccount(OWNER_X, OWNER_Y, 0, { value: funding });

      expect(await ethers.provider.getBalance(predicted)).to.equal(funding);
    });

    it("rejects a zero pubkey", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      await expect(
        factory.createAccount(ethers.ZeroHash, ethers.ZeroHash, 0)
      ).to.be.revertedWithCustomError(factory, "InvalidOwnerPubkey");
    });
  });

  describe("Wallet permissioning", function () {
    it("rejects execute() from arbitrary EOAs", async function () {
      const { factory, Wallet, alice } = await loadFixture(deployFactoryFixture);
      await factory.createAccount(OWNER_X, OWNER_Y, 0);
      const wallet = Wallet.attach(await factory.predictAddress(OWNER_X, OWNER_Y, 0));

      await expect(
        wallet.connect(alice).execute(alice.address, 0, "0x")
      ).to.be.revertedWithCustomError(wallet, "Unauthorized");
    });

    it("rejects validateUserOp() from arbitrary EOAs", async function () {
      const { factory, Wallet, alice } = await loadFixture(deployFactoryFixture);
      await factory.createAccount(OWNER_X, OWNER_Y, 0);
      const wallet = Wallet.attach(await factory.predictAddress(OWNER_X, OWNER_Y, 0));

      const emptyUserOp = {
        sender: await wallet.getAddress(),
        nonce: 0,
        initCode: "0x",
        callData: "0x",
        accountGasLimits: ethers.ZeroHash,
        preVerificationGas: 0,
        gasFees: ethers.ZeroHash,
        paymasterAndData: "0x",
        signature: "0x",
      };

      await expect(
        wallet.connect(alice).validateUserOp(emptyUserOp, ethers.ZeroHash, 0)
      ).to.be.revertedWithCustomError(wallet, "Unauthorized");
    });
  });


  describe("Deployment gas (informational)", function () {
    it("reports factory deploy + first wallet deploy gas", async function () {
      const Factory = await ethers.getContractFactory("MaktubSmartWalletFactory");
      const factoryDeployTx = await Factory.getDeployTransaction();
      const factory = await Factory.deploy();
      const factoryReceipt = await factory.deploymentTransaction().wait();

      const createTx = await factory.createAccount(OWNER_X, OWNER_Y, 0);
      const createReceipt = await createTx.wait();

      // Print to console so the SW-1 report has hard numbers without needing
      // a hardhat-gas-reporter run. (REPORT_GAS=true npm test still works.)
      console.log(
        `        Factory deploy:       ${factoryReceipt.gasUsed.toString()} gas`
      );
      console.log(
        `        First createAccount:  ${createReceipt.gasUsed.toString()} gas`
      );

      // Sanity: deployment must consume some gas (just guarding against silent failure).
      expect(factoryReceipt.gasUsed).to.be.greaterThan(0n);
      expect(createReceipt.gasUsed).to.be.greaterThan(0n);
    });
  });
});
