const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture } = require("./helpers/executionRelayFixture");

describe("ExecutionRelay — deployment", function () {
  // ──────────────────────────────────────────────────
  //  Deployment
  // ──────────────────────────────────────────────────
  describe("deployment", function () {
    it("wires immutables", async function () {
      const { relay, core, rewards } = await loadFixture(deployFixture);
      expect(await relay.maktubCore()).to.equal(await core.getAddress());
      expect(await relay.executorRewards()).to.equal(await rewards.getAddress());
    });

    it("reverts on zero MaktubCore address", async function () {
      const { rewards, admin } = await loadFixture(deployFixture);
      const Relay = await ethers.getContractFactory("ExecutionRelay");
      await expect(
        Relay.deploy(ethers.ZeroAddress, await rewards.getAddress(), admin.address)
      ).to.be.revertedWithCustomError(Relay, "ZeroAddress");
    });

    it("reverts on zero ExecutorRewards address", async function () {
      const { core, admin } = await loadFixture(deployFixture);
      const Relay = await ethers.getContractFactory("ExecutionRelay");
      await expect(
        Relay.deploy(await core.getAddress(), ethers.ZeroAddress, admin.address)
      ).to.be.revertedWithCustomError(Relay, "ZeroAddress");
    });

    it("reverts on zero admin address", async function () {
      const { core, rewards } = await loadFixture(deployFixture);
      const Relay = await ethers.getContractFactory("ExecutionRelay");
      await expect(
        Relay.deploy(
          await core.getAddress(),
          await rewards.getAddress(),
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(Relay, "ZeroAddress");
    });
  });
});
