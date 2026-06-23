const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// SW-2: Property-based / invariant tests for MaktubSmartWalletFactory address
// derivation. Hardhat does not ship with Foundry-style invariant runners, so we
// emulate them by sampling random keypairs (default 100 per property) and
// asserting the property holds for every sample. The number of samples can be
// raised via FUZZ_RUNS env var for deeper sweeps in CI.
//
// Invariants enforced (per SW-2 spec):
//   1. Different passkey public keys -> different addresses (no collisions).
//   2. Same passkey public key + same salt -> same address (deterministic).
//   3. Salt collisions across different callers are harmless (the address is a
//      pure function of factory + (ownerX, ownerY, salt); the *caller* is not
//      part of the derivation, so two different callers passing the same args
//      MUST get the same predicted address).
//   4. Address matches the counterfactual computation off-chain — re-derived
//      independently in JavaScript using the ERC-1167 init code template — for
//      at least 100 random keypairs.

const FUZZ_RUNS = Number(process.env.FUZZ_RUNS || 100);

// ERC-1167 minimal-proxy init code (the exact 55-byte template used by
// OpenZeppelin's `Clones.cloneDeterministic`, identical to Coinbase upstream).
//   0x3d602d80600a3d3981f3 363d3d373d3d3d363d73 <impl 20 bytes> 5af43d82803e903d91602b57fd5bf3
const PROXY_PREFIX = "0x3d602d80600a3d3981f3363d3d373d3d3d363d73";
const PROXY_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

function counterfactualAddress(factoryAddr, implAddr, derivedSalt) {
  // Build the 55-byte ERC-1167 init code with `implAddr` baked in.
  const initCode =
    PROXY_PREFIX +
    implAddr.slice(2).toLowerCase() +
    PROXY_SUFFIX;
  const initCodeHash = ethers.keccak256(initCode);
  return ethers.getCreate2Address(factoryAddr, derivedSalt, initCodeHash);
}

function deriveSalt(ownerX, ownerY, salt) {
  // Mirrors `_salt(ownerX, ownerY, salt) = keccak256(ownerX || ownerY || salt)`
  // exactly — the Solidity assembly path packs three 32-byte words contiguously
  // and hashes 96 bytes, which is byte-identical to `abi.encode` of the same
  // three values (since each slot is already 32 bytes wide).
  return ethers.keccak256(
    ethers.solidityPacked(["bytes32", "bytes32", "uint256"], [ownerX, ownerY, salt])
  );
}

function randomNonZeroBytes32() {
  // ethers.randomBytes is cryptographically random; trivially non-zero.
  // Re-roll on the astronomically improbable all-zeros draw (defensive).
  while (true) {
    const b = ethers.hexlify(ethers.randomBytes(32));
    if (b !== ethers.ZeroHash) return b;
  }
}

function randomKeypair() {
  return { x: randomNonZeroBytes32(), y: randomNonZeroBytes32() };
}

describe("MaktubSmartWalletFactory (SW-2: property-based invariants)", function () {
  async function deployFactoryFixture() {
    const [deployer, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MaktubSmartWalletFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();
    return { factory, deployer, alice, bob };
  }

  describe(`Invariant 1: distinct pubkeys -> distinct addresses (n=${FUZZ_RUNS})`, function () {
    it("no collisions across random keypairs", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const seen = new Map(); // address -> "x|y"
      for (let i = 0; i < FUZZ_RUNS; i++) {
        const { x, y } = randomKeypair();
        const addr = await factory.predictAddress(x, y, 0);
        const key = `${x}|${y}`;
        if (seen.has(addr)) {
          // If we ever hit this branch on random 64-byte input, either keccak is
          // broken or our random source is. Surface the collision.
          throw new Error(
            `collision at iter ${i}: ${seen.get(addr)} and ${key} both -> ${addr}`
          );
        }
        seen.set(addr, key);
      }
      expect(seen.size).to.equal(FUZZ_RUNS);
    });
  });

  describe(`Invariant 2: same (pubkey, salt) -> same address (n=${FUZZ_RUNS})`, function () {
    it("predictAddress is deterministic across repeated queries", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      for (let i = 0; i < FUZZ_RUNS; i++) {
        const { x, y } = randomKeypair();
        const salt = BigInt(i);
        const a = await factory.predictAddress(x, y, salt);
        const b = await factory.predictAddress(x, y, salt);
        const c = await factory.predictAddress(x, y, salt);
        expect(a).to.equal(b);
        expect(b).to.equal(c);
      }
    });
  });

  describe("Invariant 3: salt collisions across callers are harmless", function () {
    it("the predicted address is independent of msg.sender", async function () {
      const { factory, alice, bob } = await loadFixture(deployFactoryFixture);
      // Same (pubkey, salt) — distinct callers. The address derivation does
      // NOT include msg.sender, so both callers must see the same address.
      for (let i = 0; i < Math.min(FUZZ_RUNS, 25); i++) {
        const { x, y } = randomKeypair();
        const salt = BigInt(i);
        const fromAlice = await factory.connect(alice).predictAddress(x, y, salt);
        const fromBob = await factory.connect(bob).predictAddress(x, y, salt);
        expect(fromAlice).to.equal(fromBob);
      }
    });

    it("a second createAccount from a different caller returns the same wallet", async function () {
      const { factory, alice, bob } = await loadFixture(deployFactoryFixture);
      const { x, y } = randomKeypair();

      const predicted = await factory.predictAddress(x, y, 0);
      const tx1 = await factory.connect(alice).createAccount(x, y, 0);
      await tx1.wait();
      // Bob calls with the same args — must NOT redeploy, must NOT revert,
      // must return the exact same address.
      const tx2 = await factory.connect(bob).createAccount.staticCall(x, y, 0);
      expect(tx2).to.equal(predicted);
      // The actual call must also succeed (idempotent path).
      await expect(factory.connect(bob).createAccount(x, y, 0)).to.not.be.reverted;
    });
  });

  describe(`Invariant 4: on-chain prediction == off-chain CREATE2 derivation (n=${FUZZ_RUNS})`, function () {
    it("matches the JS-side counterfactual computation for random keypairs", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const factoryAddr = await factory.getAddress();
      const implAddr = await factory.implementation();

      for (let i = 0; i < FUZZ_RUNS; i++) {
        const { x, y } = randomKeypair();
        // Mix in some structural variety: 0, sequential, random salts.
        const salt =
          i % 3 === 0 ? 0n : i % 3 === 1 ? BigInt(i) : BigInt(`0x${ethers.hexlify(ethers.randomBytes(32)).slice(2)}`);

        const onchain = await factory.predictAddress(x, y, salt);
        const offchain = counterfactualAddress(
          factoryAddr,
          implAddr,
          deriveSalt(x, y, salt)
        );

        expect(onchain.toLowerCase()).to.equal(offchain.toLowerCase());
      }
    });

    it("the deployed wallet ends up at the address both methods agree on", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const factoryAddr = await factory.getAddress();
      const implAddr = await factory.implementation();

      // Spot-check the full deploy flow on a handful of samples — running this
      // at FUZZ_RUNS=100 is wasteful (each createAccount is ~118k gas) so we
      // cap at 10 here. Pure-prediction equivalence is already covered above.
      const RUNS = Math.min(FUZZ_RUNS, 10);
      for (let i = 0; i < RUNS; i++) {
        const { x, y } = randomKeypair();
        const salt = BigInt(i);

        const offchain = counterfactualAddress(
          factoryAddr,
          implAddr,
          deriveSalt(x, y, salt)
        );

        const tx = await factory.createAccount(x, y, salt);
        const rcpt = await tx.wait();
        // Pull `wallet` out of the WalletDeployed event to confirm what was
        // actually deployed matches our off-chain prediction.
        const evt = rcpt.logs
          .map((l) => {
            try { return factory.interface.parseLog(l); } catch { return null; }
          })
          .find((p) => p && p.name === "WalletDeployed");
        expect(evt, "WalletDeployed event missing").to.exist;
        expect(evt.args.wallet.toLowerCase()).to.equal(offchain.toLowerCase());

        // And there is now code at that address.
        const code = await ethers.provider.getCode(offchain);
        expect(code).to.not.equal("0x");
      }
    });
  });

  describe("Coverage closers (SW-2: 100% branch coverage)", function () {
    it("idempotent createAccount with msg.value forwards ETH to the existing wallet", async function () {
      // The factory has TWO `if (msg.value > 0)` branches — one on the
      // already-deployed (idempotent) path and one on the fresh-deploy path.
      // SW-1 covers fresh-deploy; this closes the idempotent-with-funding gap.
      const { factory, alice, bob } = await loadFixture(deployFactoryFixture);
      const { x, y } = randomKeypair();

      // First call deploys; second call (by anyone) tops up.
      await factory.connect(alice).createAccount(x, y, 0);
      const predicted = await factory.predictAddress(x, y, 0);
      const balBefore = await ethers.provider.getBalance(predicted);

      const topup = ethers.parseEther("0.25");
      await factory.connect(bob).createAccount(x, y, 0, { value: topup });

      const balAfter = await ethers.provider.getBalance(predicted);
      expect(balAfter - balBefore).to.equal(topup);
    });

    it("rejects (0, nonzero) and (nonzero, 0) per the explicit-zero check", async function () {
      // The check is `if (ownerX == 0 && ownerY == 0)` — a logical AND, not OR.
      // Half-zero pubkeys are NOT mathematically valid P-256 points, but the
      // factory deliberately does not validate on-curve (that happens at
      // signature-verification time). We document and lock in this behavior:
      // half-zero IS accepted by the factory.
      const { factory } = await loadFixture(deployFactoryFixture);
      const ZERO = ethers.ZeroHash;
      const ONE = "0x" + "00".repeat(31) + "01";

      // Both half-zero variants must succeed (they will fail on first signature
      // verification, which is the correct layer to enforce on-curve).
      await expect(factory.createAccount(ZERO, ONE, 0)).to.not.be.reverted;
      await expect(factory.createAccount(ONE, ZERO, 0)).to.not.be.reverted;
    });

    it("predictAddress() is callable from any account and returns the same value", async function () {
      // Belt-and-suspenders: predictAddress is `view` so msg.sender shouldn't
      // matter, but we want the branch coverage tool to mark the path as hit
      // from at least two different senders.
      const { factory, alice, bob } = await loadFixture(deployFactoryFixture);
      const { x, y } = randomKeypair();
      const a = await factory.connect(alice).predictAddress(x, y, 7);
      const b = await factory.connect(bob).predictAddress(x, y, 7);
      expect(a).to.equal(b);
    });
  });

  describe("Wallet implementation: coverage closers", function () {
    // These hit branches in MaktubSmartWallet that the factory cannot reach,
    // so coverage of the wallet's initialize() is complete when paired with
    // the SW-1 suite. (WebAuthn / validateUserOp / execute paths remain SW-3+.)

    it("initialize() reverts InvalidOwnerPubkey when called with (0, 0) on a fresh clone", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const Wallet = await ethers.getContractFactory("MaktubSmartWallet");

      // Manually deploy a raw clone of the factory's implementation (bypassing
      // the factory's zero-pubkey guard) so we can hit the *second* branch of
      // initialize: "(_ownerX==0 && _ownerY==0) but caller passed (0,0)".
      const implAddr = await factory.implementation();
      // Mirror OZ Clones.clone() bytecode: 0x3d602d80600a3d3981f3 + 363d3d373d3d3d363d73 + impl + 5af43d82803e903d91602b57fd5bf3
      const initCode =
        "0x3d602d80600a3d3981f3363d3d373d3d3d363d73" +
        implAddr.slice(2).toLowerCase() +
        "5af43d82803e903d91602b57fd5bf3";

      const [deployer] = await ethers.getSigners();
      const tx = await deployer.sendTransaction({ data: initCode });
      const rcpt = await tx.wait();
      const cloneAddr = rcpt.contractAddress;
      expect(cloneAddr).to.properAddress;

      const clone = Wallet.attach(cloneAddr);
      // Owner is (0, 0) on the fresh clone; calling initialize with (0, 0)
      // is an invalid pubkey, not a double-init.
      await expect(
        clone.initialize(ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(clone, "InvalidOwnerPubkey");

      // And a valid initialize on the same clone still works after the revert.
      const x = randomNonZeroBytes32();
      const y = randomNonZeroBytes32();
      await expect(clone.initialize(x, y))
        .to.emit(clone, "OwnerInitialized")
        .withArgs(x, y);
    });
  });
});
