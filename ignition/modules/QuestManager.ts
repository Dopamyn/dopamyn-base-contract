import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const QuestManagerModule = buildModule("QuestManagerModule", (m) => {
  // USDC address on Base mainnet
  const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  const questManager = m.contract("QuestManager", [usdcAddress]);

  return { questManager };
});

export default QuestManagerModule;
