import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import { HardhatUserConfig } from "hardhat/config";
import "solidity-coverage";

import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: false,
        runs: 200,
      },
    },
  },
  etherscan: {
    apiKey: {
      "base-mainnet": process.env.BASESCAN_API_KEY || "",
    },
    enabled: true,
    customChains: [
      {
        network: "base-mainnet",
        chainId: 8453,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=8453",
          browserURL: "https://etherscan.io",
        },
      },
    ],
  },
  networks: {
    localhost: {
      chainId: 31337,
    },
    "hedera-testnet": {
      url: process.env.HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api",
      chainId: 296,
      gas: 5_000_000,
      gasPrice: 1_020_000_000_000,
      accounts: process.env.HEDERA_TESTNET_PRIVATE_KEY
        ? [process.env.HEDERA_TESTNET_PRIVATE_KEY]
        : [],
    },
    base: {
      url: process.env.BASE_ALCHEMY_RPC_URL || "",
      chainId: 8453,
      accounts: process.env.BASE_PRIVATE_KEY
        ? [process.env.BASE_PRIVATE_KEY]
        : [],
    },
  },
};

export default config;
