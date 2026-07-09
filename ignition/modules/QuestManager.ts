import hre from "hardhat";
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const QuestManagerModule = buildModule("QuestManagerModule", (m) => {
  const networkName = hre.network.name;

  // Token address priority:
  // 1. Parameter passed during deployment (highest priority)
  // 2. QUEST_MANAGER_TOKEN_ADDRESS from .env (generic cross-chain override)
  // 3. Network-specific default token for the active deployment target
  // 4. Fallback Base Mainnet USDC address
  const networkDefaultTokenAddress =
    networkName === "base-sepolia"
      ? process.env.BASE_SEPOLIA_USDC_ADDRESS ||
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
      : networkName === "base"
        ? process.env.BASE_MAINNET_USDC_ADDRESS ||
          "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        : networkName === "hedera-testnet"
          ? process.env.HEDERA_TESTNET_TOKEN_ADDRESS
          : process.env.BASE_MAINNET_USDC_ADDRESS ||
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  const defaultTokenAddress =
    process.env.QUEST_MANAGER_TOKEN_ADDRESS ||
    networkDefaultTokenAddress ||
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  const tokenAddress = m.getParameter("tokenAddress", defaultTokenAddress);

  const questManager = m.contract("QuestManager", [tokenAddress]);

  return { questManager };
});

export default QuestManagerModule;
