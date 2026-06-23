/**
 * Integration Tests — Maktub Protocol on Base Sepolia
 *
 * These tests hit the actual deployed contracts on Base Sepolia testnet.
 * They verify on-chain state created during deployment (Heartbeat #0,
 * deployer registration, executor staking, token balances).
 *
 * Run with: npx hardhat test test/integration/MaktubIntegration.test.js --network baseSepolia
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

// Deployed contract addresses on Base Sepolia
const DEPLOYED = {
  RecipientRegistry: "0xfF66eEbFCf0C27f682B84500731752AaCAc7BBc9",
  MktbToken: "0x068d9176514C868d8fB43CE84A775b63cf223C5D",
  TimelockController: "0x268602317bF433A88a2cB93e06E458DC4fFC46b9",
  MktbGovernance: "0xc60EAF688ADf6Cf9b0512De5d06f7341F1993Ddc",
  ExecutorRewards: "0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba",
  MaktubCore: "0x46f491eD5A82dA53Eb077aE35C4C5ed328864331",
};

const DEPLOYER = "0x644a7e9D5CACC60Cd41882D114a2339B891B1cE1";

describe("Maktub Protocol — Base Sepolia Integration Tests", function () {
  this.timeout(60_000); // testnet calls can be slow

  let core, registry, token, rewards;

  before(async function () {
    // Attach to deployed contracts using their ABIs from compilation artifacts
    const MaktubCore = await ethers.getContractFactory("MaktubCore");
    core = MaktubCore.attach(DEPLOYED.MaktubCore);

    const RecipientRegistry = await ethers.getContractFactory("RecipientRegistry");
    registry = RecipientRegistry.attach(DEPLOYED.RecipientRegistry);

    const MktbToken = await ethers.getContractFactory("MktbToken");
    token = MktbToken.attach(DEPLOYED.MktbToken);

    const ExecutorRewards = await ethers.getContractFactory("ExecutorRewards");
    rewards = ExecutorRewards.attach(DEPLOYED.ExecutorRewards);
  });

  // ──────────────────────────────────────────────
  //  Heartbeat #0 State
  // ──────────────────────────────────────────────
  describe("Heartbeat #0", function () {
    it("should exist (heartbeatCount >= 1)", async function () {
      const count = await core.heartbeatCount();
      expect(count).to.be.gte(1n);
    });

    it("should be owned by the deployer", async function () {
      const hb = await core.getHeartbeat(0);
      expect(hb.owner).to.equal(DEPLOYER);
    });

    it("should have a non-empty payload", async function () {
      const hb = await core.getHeartbeat(0);
      expect(hb.payload.length).to.be.gt(2); // "0x" prefix means empty
    });

    it("should have a valid interval (>= 1 hour)", async function () {
      const hb = await core.getHeartbeat(0);
      expect(hb.interval).to.be.gte(3600n);
    });

    it("should not be executed", async function () {
      const hb = await core.getHeartbeat(0);
      expect(hb.executed).to.be.false;
    });

    it("should not be deactivated", async function () {
      const hb = await core.getHeartbeat(0);
      expect(hb.deactivated).to.be.false;
    });

    it("should report isExpired status without reverting", async function () {
      const expired = await core.isExpired(0);
      // We just verify it returns a boolean (true or false depending on check-in timing)
      expect(typeof expired).to.equal("boolean");
    });

    it("should report timeRemaining without reverting", async function () {
      const remaining = await core.timeRemaining(0);
      // timeRemaining is >= 0 (could be 0 if expired)
      expect(remaining).to.be.gte(0n);
    });
  });

  // ──────────────────────────────────────────────
  //  RecipientRegistry — Deployer Registration
  // ──────────────────────────────────────────────
  describe("RecipientRegistry", function () {
    it("should have the deployer registered as a recipient", async function () {
      const isReg = await registry.isRegistered(DEPLOYER);
      expect(isReg).to.be.true;
    });

    it("should have a non-empty PRE public key for the deployer", async function () {
      const preKey = await registry.getPrePublicKey(DEPLOYER);
      expect(preKey.length).to.be.gt(2); // not "0x"
    });
  });

  // ──────────────────────────────────────────────
  //  ExecutorRewards — Deployer as Active Executor
  // ──────────────────────────────────────────────
  describe("ExecutorRewards", function () {
    it("should have the deployer as an active executor", async function () {
      const isActive = await rewards.isActiveExecutor(DEPLOYER);
      expect(isActive).to.be.true;
    });

    it("should show the deployer's stake >= minimumStake", async function () {
      const stake = await rewards.stakes(DEPLOYER);
      const minStake = await rewards.minimumStake();
      expect(stake).to.be.gte(minStake);
    });

    it("should have totalStaked > 0", async function () {
      const totalStaked = await rewards.totalStaked();
      expect(totalStaked).to.be.gt(0n);
    });

    it("should have MaktubCore address set", async function () {
      const coreAddr = await rewards.maktubCore();
      expect(coreAddr).to.equal(DEPLOYED.MaktubCore);
    });

    it("should have the reward pool funded (contract holds MKTB)", async function () {
      const balance = await token.balanceOf(DEPLOYED.ExecutorRewards);
      // Should hold at least the staked amount; if reward pool was funded, much more
      expect(balance).to.be.gt(0n);
    });

    it("should not be paused", async function () {
      const isPaused = await rewards.paused();
      expect(isPaused).to.be.false;
    });
  });

  // ──────────────────────────────────────────────
  //  MktbToken — Balances
  // ──────────────────────────────────────────────
  describe("MKTB Token", function () {
    it("should have total supply of 100M MKTB", async function () {
      const supply = await token.totalSupply();
      const expectedSupply = ethers.parseEther("100000000");
      expect(supply).to.equal(expectedSupply);
    });

    it("should show deployer balance ~39000 MKTB (after staking 1000)", async function () {
      const balance = await token.balanceOf(DEPLOYER);
      // Deployer started with 40M, staked 1000 MKTB => ~39,999,000 MKTB
      // Use a wide range to account for any other distributions
      const lowerBound = ethers.parseEther("39000000");
      const upperBound = ethers.parseEther("40000000");
      expect(balance).to.be.gte(lowerBound);
      expect(balance).to.be.lte(upperBound);
    });

    it("should show ExecutorRewards holds 35M+ MKTB (reward pool + stake)", async function () {
      const balance = await token.balanceOf(DEPLOYED.ExecutorRewards);
      // 35M reward pool + 1000 stake = 35,001,000 MKTB
      const lowerBound = ethers.parseEther("35000000");
      expect(balance).to.be.gte(lowerBound);
    });
  });

  // ──────────────────────────────────────────────
  //  MaktubCore — Cross-contract references
  // ──────────────────────────────────────────────
  describe("MaktubCore — Cross-contract references", function () {
    it("should reference the correct RecipientRegistry", async function () {
      const regAddr = await core.recipientRegistry();
      expect(regAddr).to.equal(DEPLOYED.RecipientRegistry);
    });

    it("should reference the correct ExecutorRewards", async function () {
      const rewardsAddr = await core.executorRewards();
      expect(rewardsAddr).to.equal(DEPLOYED.ExecutorRewards);
    });

    it("should have the correct creation fee", async function () {
      const fee = await core.creationFee();
      expect(fee).to.equal(124000000000000n); // 0.000124 ETH
    });

    it("should validate the deployer as an executor via isExecutor()", async function () {
      const isExec = await core.isExecutor(DEPLOYER);
      expect(isExec).to.be.true;
    });
  });
});
