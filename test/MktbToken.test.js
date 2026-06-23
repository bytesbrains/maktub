const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("MktbToken", function () {
  const MAX_SUPPLY = ethers.parseEther("100000000"); // 100M

  async function deployFixture() {
    const [deployer, alice, bob, charlie] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MktbToken");
    const token = await Token.deploy(deployer.address);
    return { token, deployer, alice, bob, charlie };
  }

  // ──────────────────────────────────────────────────
  //  Basics
  // ──────────────────────────────────────────────────
  describe("Deployment", function () {
    it("should have correct name and symbol", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.name()).to.equal("Maktub");
      expect(await token.symbol()).to.equal("MKTB");
    });

    it("should have 18 decimals", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.decimals()).to.equal(18);
    });

    it("should start with zero supply", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.totalSupply()).to.equal(0);
    });

    it("should have correct MAX_SUPPLY", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
    });

    it("should set deployer as owner", async function () {
      const { token, deployer } = await loadFixture(deployFixture);
      expect(await token.owner()).to.equal(deployer.address);
    });
  });

  // ──────────────────────────────────────────────────
  //  Minting
  // ──────────────────────────────────────────────────
  describe("mint", function () {
    it("should mint tokens up to max supply", async function () {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1000");
      await token.mint(alice.address, amount);
      expect(await token.balanceOf(alice.address)).to.equal(amount);
      expect(await token.totalSupply()).to.equal(amount);
    });

    it("should allow minting exactly MAX_SUPPLY", async function () {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      await token.mint(alice.address, MAX_SUPPLY);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
    });

    it("should revert with ExceedsMaxSupply when exceeding cap", async function () {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      await token.mint(alice.address, MAX_SUPPLY);
      await expect(
        token.mint(alice.address, 1)
      ).to.be.revertedWithCustomError(token, "ExceedsMaxSupply");
    });

    it("should revert if minting would exceed MAX_SUPPLY in partial", async function () {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      const half = MAX_SUPPLY / 2n;
      await token.mint(alice.address, half);
      await expect(
        token.mint(alice.address, half + 1n)
      ).to.be.revertedWithCustomError(token, "ExceedsMaxSupply");
    });

    it("should revert if caller is not owner", async function () {
      const { token, alice } = await loadFixture(deployFixture);
      await expect(
        token.connect(alice).mint(alice.address, 100)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should allow multiple mints up to max supply", async function () {
      const { token, deployer, alice, bob } = await loadFixture(deployFixture);
      const amount1 = ethers.parseEther("50000000");
      const amount2 = ethers.parseEther("50000000");
      await token.mint(alice.address, amount1);
      await token.mint(bob.address, amount2);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
    });
  });

  // ──────────────────────────────────────────────────
  //  Burn
  // ──────────────────────────────────────────────────
  describe("burn", function () {
    it("should allow token holder to burn their tokens", async function () {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1000");
      await token.mint(alice.address, amount);

      await token.connect(alice).burn(ethers.parseEther("500"));
      expect(await token.balanceOf(alice.address)).to.equal(
        ethers.parseEther("500")
      );
      expect(await token.totalSupply()).to.equal(ethers.parseEther("500"));
    });

    it("should revert if burning more than balance", async function () {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("100");
      await token.mint(alice.address, amount);
      await expect(
        token.connect(alice).burn(amount + 1n)
      ).to.be.reverted;
    });
  });

  // ──────────────────────────────────────────────────
  //  Transfer
  // ──────────────────────────────────────────────────
  describe("transfer", function () {
    it("should transfer tokens between accounts", async function () {
      const { token, deployer, alice, bob } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1000");
      await token.mint(alice.address, amount);

      await token.connect(alice).transfer(bob.address, ethers.parseEther("400"));
      expect(await token.balanceOf(alice.address)).to.equal(
        ethers.parseEther("600")
      );
      expect(await token.balanceOf(bob.address)).to.equal(
        ethers.parseEther("400")
      );
    });
  });

  // ──────────────────────────────────────────────────
  //  Permit (ERC20Permit / EIP-2612)
  // ──────────────────────────────────────────────────
  describe("permit", function () {
    it("should allow gasless approval via permit signature", async function () {
      const { token, deployer, alice, bob } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1000");
      await token.mint(alice.address, amount);

      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
      const nonce = await token.nonces(alice.address);

      // Build the EIP-712 domain
      const domain = {
        name: "Maktub",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await token.getAddress(),
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        owner: alice.address,
        spender: bob.address,
        value: amount,
        nonce: nonce,
        deadline: deadline,
      };

      const sig = await alice.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(sig);

      await token.permit(alice.address, bob.address, amount, deadline, v, r, s);
      expect(await token.allowance(alice.address, bob.address)).to.equal(amount);
    });
  });

  // ──────────────────────────────────────────────────
  //  Voting Delegation (ERC20Votes)
  // ──────────────────────────────────────────────────
  describe("voting delegation", function () {
    it("should have zero voting power without delegation", async function () {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1000");
      await token.mint(alice.address, amount);
      expect(await token.getVotes(alice.address)).to.equal(0);
    });

    it("should activate voting power via self-delegation", async function () {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1000");
      await token.mint(alice.address, amount);
      await token.connect(alice).delegate(alice.address);
      expect(await token.getVotes(alice.address)).to.equal(amount);
    });

    it("should delegate voting power to another address", async function () {
      const { token, deployer, alice, bob } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1000");
      await token.mint(alice.address, amount);
      await token.connect(alice).delegate(bob.address);
      expect(await token.getVotes(bob.address)).to.equal(amount);
      expect(await token.getVotes(alice.address)).to.equal(0);
    });

    it("should update voting power on transfer after delegation", async function () {
      const { token, deployer, alice, bob } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1000");
      await token.mint(alice.address, amount);
      await token.connect(alice).delegate(alice.address);
      await token.connect(bob).delegate(bob.address);

      await token
        .connect(alice)
        .transfer(bob.address, ethers.parseEther("300"));
      expect(await token.getVotes(alice.address)).to.equal(
        ethers.parseEther("700")
      );
      expect(await token.getVotes(bob.address)).to.equal(
        ethers.parseEther("300")
      );
    });
  });

  // ──────────────────────────────────────────────────
  //  Ownership
  // ──────────────────────────────────────────────────
  describe("ownership", function () {
    it("should allow owner to renounce ownership, disabling future mints", async function () {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      await token.renounceOwnership();
      expect(await token.owner()).to.equal(ethers.ZeroAddress);
      await expect(
        token.mint(alice.address, 1)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });
});
