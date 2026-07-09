import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import { HardhatUserConfig } from "hardhat/config";
import "solidity-coverage";

import "dotenv/config";

/** Same deployer key as Base unless ARBITRUM_PRIVATE_KEY is set explicitly. */
function deployerAccounts(
  networkPrivateKey = process.env.ARBITRUM_PRIVATE_KEY ||
    process.env.BASE_PRIVATE_KEY
): string[] {
  return networkPrivateKey ? [networkPrivateKey] : [];
}

const etherscanApiKey =
  process.env.ETHERSCAN_API_KEY ||
  process.env.ARBISCAN_API_KEY ||
  process.env.BASESCAN_API_KEY ||
  "";

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
    apiKey: etherscanApiKey,
    enabled: true,
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=8453",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=84532",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "arbitrum",
        chainId: 42161,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=42161",
          browserURL: "https://arbiscan.io",
        },
      },
      {
        network: "arbitrum-sepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=421614",
          browserURL: "https://sepolia.arbiscan.io",
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
      accounts: deployerAccounts(process.env.BASE_PRIVATE_KEY),
    },
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: deployerAccounts(process.env.BASE_PRIVATE_KEY),
    },
    arbitrum: {
      url:
        process.env.ARBITRUM_RPC_URL ||
        process.env.ARBITRUM_ALCHEMY_RPC_URL ||
        "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts: deployerAccounts(),
    },
    "arbitrum-sepolia": {
      url:
        process.env.ARBITRUM_SEPOLIA_RPC_URL ||
        "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: deployerAccounts(),
    },
  },
};

export default config;
