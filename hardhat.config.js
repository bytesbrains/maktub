require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      // Default 31337. The mobile Flash e2e runs the devnet AS 84532 so the
      // app's local-key signer (which hard-refuses any chain != 84532, issue
      // #82) will sign against it: HARDHAT_CHAIN_ID=84532 npx hardhat node.
      chainId: Number(process.env.HARDHAT_CHAIN_ID || 31337),
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: Number(process.env.HARDHAT_CHAIN_ID || 31337),
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
    },
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  paths: {
    sources: "./contracts/v3",
    tests: "./test",
    artifacts: "./artifacts",
    cache: "./cache",
  },
};
