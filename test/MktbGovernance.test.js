const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
  mine,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("MktbGovernance", function () {
  const PROPOSAL_THRESHOLD = ethers.parseEther("100000"); // 100K MKTB
  // Base L2 has ~2s blocks. Calibrated for Base, not Ethereum mainnet.
  const VOTING_DELAY = 43_200; // blocks (~1 day at 2s/block on Base)
  const VOTING_PERIOD = 302_400; // blocks (~7 days at 2s/block on Base)
  const QUORUM_FRACTION = 4; // 4%
  const TIMELOCK_DELAY = 3600; // 1 hour in seconds

  async function deployFixture() {
    const [deployer, proposer, voter1, voter2, voter3, stranger] =
      await ethers.getSigners();

    // Deploy token
    const Token = await ethers.getContractFactory("MktbToken");
    const token = await Token.deploy(deployer.address);

    // Deploy TimelockController
    // proposers and executors arrays - we'll configure after governor deploy
    const Timelock = await ethers.getContractFactory("TimelockController");
    const timelock = await Timelock.deploy(
      TIMELOCK_DELAY,
      [], // proposers (will add governor)
      [ethers.ZeroAddress], // executors (anyone can execute)
      deployer.address // admin
    );

    // Deploy Governor
    const Governor = await ethers.getContractFactory("MktbGovernance");
    const governor = await Governor.deploy(
      await token.getAddress(),
      await timelock.getAddress()
    );

    // Grant governor the proposer and executor roles on timelock
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
    await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
    await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress());

    // Mint tokens for voters
    // proposer needs >= 100K to propose
    await token.mint(proposer.address, ethers.parseEther("150000"));
    // voter1 gets enough for quorum (4% of what's minted)
    await token.mint(voter1.address, ethers.parseEther("2000000"));
    await token.mint(voter2.address, ethers.parseEther("500000"));
    await token.mint(voter3.address, ethers.parseEther("100000"));

    // Self-delegate to activate voting power (required for ERC20Votes)
    await token.connect(proposer).delegate(proposer.address);
    await token.connect(voter1).delegate(voter1.address);
    await token.connect(voter2).delegate(voter2.address);
    await token.connect(voter3).delegate(voter3.address);

    // Need to mine a block so that the checkpoints are visible to the governor
    await mine(1);

    return {
      token,
      timelock,
      governor,
      deployer,
      proposer,
      voter1,
      voter2,
      voter3,
      stranger,
    };
  }

  // Helper: create a simple proposal to transfer ETH (does nothing meaningful)
  async function createProposal(governor, proposer, description) {
    const targets = [await governor.getAddress()];
    const values = [0];
    const calldatas = [governor.interface.encodeFunctionData("votingDelay")]; // no-op call
    // Use a unique description
    const desc = description || "Proposal #1: Test proposal";
    const tx = await governor
      .connect(proposer)
      .propose(targets, values, calldatas, desc);
    const receipt = await tx.wait();
    const event = receipt.logs.find((log) => {
      try {
        return governor.interface.parseLog(log)?.name === "ProposalCreated";
      } catch {
        return false;
      }
    });
    const parsed = governor.interface.parseLog(event);
    return {
      proposalId: parsed.args.proposalId,
      targets,
      values,
      calldatas,
      descriptionHash: ethers.id(desc),
    };
  }

  // ──────────────────────────────────────────────────
  //  Deployment
  // ──────────────────────────────────────────────────
  describe("Deployment", function () {
    it("should have correct governor name", async function () {
      const { governor } = await loadFixture(deployFixture);
      expect(await governor.name()).to.equal("MktbGovernance");
    });

    it("should have correct voting delay", async function () {
      const { governor } = await loadFixture(deployFixture);
      expect(await governor.votingDelay()).to.equal(VOTING_DELAY);
    });

    it("should have correct voting period", async function () {
      const { governor } = await loadFixture(deployFixture);
      expect(await governor.votingPeriod()).to.equal(VOTING_PERIOD);
    });

    it("should have correct proposal threshold", async function () {
      const { governor } = await loadFixture(deployFixture);
      expect(await governor.proposalThreshold()).to.equal(PROPOSAL_THRESHOLD);
    });
  });

  // ──────────────────────────────────────────────────
  //  Proposal Creation
  // ──────────────────────────────────────────────────
  describe("Proposal Creation", function () {
    it("should allow address with enough tokens to propose", async function () {
      const { governor, proposer } = await loadFixture(deployFixture);
      const { proposalId } = await createProposal(governor, proposer);
      // Proposal state 0 = Pending
      expect(await governor.state(proposalId)).to.equal(0);
    });

    it("should revert if proposer has insufficient voting power", async function () {
      const { governor, stranger } = await loadFixture(deployFixture);
      const targets = [await governor.getAddress()];
      const values = [0];
      const calldatas = [
        governor.interface.encodeFunctionData("votingDelay"),
      ];
      await expect(
        governor.connect(stranger).propose(targets, values, calldatas, "Fail")
      ).to.be.revertedWithCustomError(governor, "GovernorInsufficientProposerVotes");
    });
  });

  // ──────────────────────────────────────────────────
  //  Voting
  // ──────────────────────────────────────────────────
  describe("Voting", function () {
    it("should allow voting after voting delay", async function () {
      const { governor, proposer, voter1 } = await loadFixture(deployFixture);
      const { proposalId } = await createProposal(governor, proposer);

      // Advance past voting delay
      await mine(VOTING_DELAY + 1);

      // State should be Active (1)
      expect(await governor.state(proposalId)).to.equal(1);

      // Vote: 1 = For
      await expect(governor.connect(voter1).castVote(proposalId, 1))
        .to.emit(governor, "VoteCast");
    });

    it("should not allow voting before voting delay passes", async function () {
      const { governor, proposer, voter1 } = await loadFixture(deployFixture);
      const { proposalId } = await createProposal(governor, proposer);

      // State is Pending
      await expect(
        governor.connect(voter1).castVote(proposalId, 1)
      ).to.be.revertedWithCustomError(governor, "GovernorUnexpectedProposalState");
    });

    it("should track votes correctly (For, Against, Abstain)", async function () {
      const { governor, proposer, voter1, voter2, voter3 } =
        await loadFixture(deployFixture);
      const { proposalId } = await createProposal(governor, proposer);

      await mine(VOTING_DELAY + 1);

      // voter1 votes For (1), voter2 votes Against (0), voter3 votes Abstain (2)
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 0);
      await governor.connect(voter3).castVote(proposalId, 2);

      const [againstVotes, forVotes, abstainVotes] =
        await governor.proposalVotes(proposalId);
      expect(forVotes).to.equal(ethers.parseEther("2000000"));
      expect(againstVotes).to.equal(ethers.parseEther("500000"));
      expect(abstainVotes).to.equal(ethers.parseEther("100000"));
    });
  });

  // ──────────────────────────────────────────────────
  //  Quorum
  // ──────────────────────────────────────────────────
  describe("Quorum", function () {
    it("should require 4% quorum for proposal to succeed", async function () {
      const { governor, token, proposer } = await loadFixture(deployFixture);
      // Total supply = 2.75M. 4% quorum = 110K.
      // proposer has 150K which is above quorum
      const { proposalId } = await createProposal(governor, proposer);

      await mine(VOTING_DELAY + 1);

      // Only proposer votes For (150K). Quorum = 4% of 2.75M = 110K. Should pass quorum.
      await governor.connect(proposer).castVote(proposalId, 1);

      // Advance past voting period
      await mine(VOTING_PERIOD + 1);

      // State should be Succeeded (4)
      expect(await governor.state(proposalId)).to.equal(4);
    });

    it("should report correct quorum value", async function () {
      const { governor, token } = await loadFixture(deployFixture);
      const blockNum = await ethers.provider.getBlockNumber();
      const quorum = await governor.quorum(blockNum - 1);
      const totalSupply = await token.totalSupply();
      // 4% of total supply
      expect(quorum).to.equal((totalSupply * 4n) / 100n);
    });
  });

  // ──────────────────────────────────────────────────
  //  Timelock Execution
  // ──────────────────────────────────────────────────
  describe("Timelock Execution", function () {
    it("should queue and execute a successful proposal through timelock", async function () {
      const { governor, proposer, voter1 } = await loadFixture(deployFixture);
      const { proposalId, targets, values, calldatas, descriptionHash } =
        await createProposal(governor, proposer);

      // Advance past voting delay
      await mine(VOTING_DELAY + 1);

      // Vote For with voter1 (2M MKTB — well above quorum)
      await governor.connect(voter1).castVote(proposalId, 1);

      // Advance past voting period
      await mine(VOTING_PERIOD + 1);

      // State should be Succeeded (4)
      expect(await governor.state(proposalId)).to.equal(4);

      // Queue
      await governor.queue(targets, values, calldatas, descriptionHash);
      expect(await governor.state(proposalId)).to.equal(5); // Queued

      // Advance past timelock delay
      await time.increase(TIMELOCK_DELAY + 1);

      // Execute
      await governor.execute(targets, values, calldatas, descriptionHash);
      expect(await governor.state(proposalId)).to.equal(7); // Executed
    });

    it("should not allow execution before timelock delay", async function () {
      const { governor, proposer, voter1 } = await loadFixture(deployFixture);
      const { proposalId, targets, values, calldatas, descriptionHash } =
        await createProposal(governor, proposer);

      await mine(VOTING_DELAY + 1);
      await governor.connect(voter1).castVote(proposalId, 1);
      await mine(VOTING_PERIOD + 1);

      // Queue
      await governor.queue(targets, values, calldatas, descriptionHash);

      // Try to execute immediately (should fail)
      await expect(
        governor.execute(targets, values, calldatas, descriptionHash)
      ).to.be.reverted;
    });
  });

  // ──────────────────────────────────────────────────
  //  Proposal Threshold Enforcement
  // ──────────────────────────────────────────────────
  describe("Threshold Enforcement", function () {
    it("should allow proposal from address with exactly threshold tokens", async function () {
      const { governor, token, deployer, voter3 } =
        await loadFixture(deployFixture);
      // voter3 has exactly 100K (the threshold)
      const { proposalId } = await createProposal(
        governor,
        voter3,
        "Threshold test proposal"
      );
      expect(await governor.state(proposalId)).to.equal(0); // Pending
    });

    it("should reject proposal from address with less than threshold", async function () {
      const { governor, token, deployer, stranger } =
        await loadFixture(deployFixture);
      // Mint just under threshold
      await token.mint(stranger.address, PROPOSAL_THRESHOLD - 1n);
      await token.connect(stranger).delegate(stranger.address);
      await mine(1);

      const targets = [await governor.getAddress()];
      const values = [0];
      const calldatas = [
        governor.interface.encodeFunctionData("votingDelay"),
      ];
      await expect(
        governor
          .connect(stranger)
          .propose(targets, values, calldatas, "Should fail")
      ).to.be.revertedWithCustomError(governor, "GovernorInsufficientProposerVotes");
    });
  });

  // ──────────────────────────────────────────────────
  //  Defeated Proposal
  // ──────────────────────────────────────────────────
  describe("Defeated Proposal", function () {
    it("should mark proposal as defeated if more against than for", async function () {
      const { governor, proposer, voter1, voter2 } =
        await loadFixture(deployFixture);
      const { proposalId } = await createProposal(
        governor,
        proposer,
        "Defeat me"
      );

      await mine(VOTING_DELAY + 1);

      // voter1 votes For (2M), voter2 votes Against (500K)
      // Actually let's reverse: voter2 votes for, voter1 against
      await governor.connect(voter1).castVote(proposalId, 0); // Against (2M)
      await governor.connect(voter2).castVote(proposalId, 1); // For (500K)

      await mine(VOTING_PERIOD + 1);

      // State should be Defeated (3)
      expect(await governor.state(proposalId)).to.equal(3);
    });
  });
});
