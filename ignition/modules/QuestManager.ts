import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const QuestManagerModule = buildModule("QuestManagerModule", (m) => {
  // Token address priority:
  // 1. Parameter passed during deployment (highest priority)
  // 2. QUEST_MANAGER_TOKEN_ADDRESS from .env (generic cross-chain override)
  // 3. HEDERA_TESTNET_TOKEN_ADDRESS from .env (for Hedera Testnet deployments)
  // 4. BASE_SEPOLIA_USDC_ADDRESS from .env (for Base Sepolia deployments)
  // 5. BASE_MAINNET_USDC_ADDRESS from .env (for Base Mainnet deployments)
  // 6. Default Base Mainnet USDC address
  const defaultTokenAddress =
    process.env.QUEST_MANAGER_TOKEN_ADDRESS ||
    process.env.HEDERA_TESTNET_TOKEN_ADDRESS ||
    process.env.BASE_SEPOLIA_USDC_ADDRESS ||
    process.env.BASE_MAINNET_USDC_ADDRESS ||
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  const tokenAddress = m.getParameter("tokenAddress", defaultTokenAddress);

  const questManager = m.contract("QuestManager", [tokenAddress]);

  return { questManager };
});

export default QuestManagerModule;
