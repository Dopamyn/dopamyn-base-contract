import hre from "hardhat";
import "dotenv/config";

function getTokenAddressForNetwork(networkName: string): string | undefined {
  if (process.env.QUEST_MANAGER_TOKEN_ADDRESS) {
    return process.env.QUEST_MANAGER_TOKEN_ADDRESS;
  }

  switch (networkName) {
    case "base-sepolia":
      return (
        process.env.BASE_SEPOLIA_USDC_ADDRESS ||
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
      );
    case "base":
      return (
        process.env.BASE_MAINNET_USDC_ADDRESS ||
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      );
    case "hedera-testnet":
      return process.env.HEDERA_TESTNET_TOKEN_ADDRESS;
    default:
      return process.env.BASE_MAINNET_USDC_ADDRESS;
  }
}

async function main() {
  const networkName = hre.network.name;
  const tokenAddress = getTokenAddressForNetwork(networkName);

  if (!tokenAddress) {
    throw new Error(
      `Missing token address for network ${networkName}. Set QUEST_MANAGER_TOKEN_ADDRESS or the network-specific token env.`
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log(`Network: ${networkName}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${balance.toString()}`);
  console.log(`Token: ${tokenAddress}`);

  const QuestManager = await hre.ethers.getContractFactory("QuestManager");
  const deployOverrides =
    networkName === "hedera-testnet"
      ? {
          gasLimit: 8_000_000,
          gasPrice: 1_020_000_000_000n,
        }
      : {};

  const questManager = await QuestManager.deploy(tokenAddress, deployOverrides);

  await questManager.waitForDeployment();

  console.log(`QuestManager deployed at: ${await questManager.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
