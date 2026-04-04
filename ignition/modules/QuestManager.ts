import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import "dotenv/config";

const QuestManagerModule = buildModule("QuestManagerModule", (m) => {
  // Token address priority:
  // 1. Parameter passed during deployment (highest priority)
  // 2. BASE_SEPOLIA_USDC_ADDRESS from .env (for Base Sepolia deployments)
  // 3. BASE_MAINNET_USDC_ADDRESS from .env (for Base Mainnet deployments)
  // 4. Default Base Mainnet USDC address
  const defaultTokenAddress =
    process.env.BASE_SEPOLIA_USDC_ADDRESS ||
    process.env.BASE_MAINNET_USDC_ADDRESS ||
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base Mainnet USDC

  const tokenAddress = m.getParameter("tokenAddress", defaultTokenAddress);

  const questManager = m.contract("QuestManager", [tokenAddress]);

  return { questManager };
});

export default QuestManagerModule;
