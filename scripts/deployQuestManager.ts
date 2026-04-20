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

  const deployedAddress = await questManager.getAddress();
  console.log(`QuestManager deployed at: ${deployedAddress}`);

  await verifyDeployment(deployedAddress, [tokenAddress], networkName);
}

async function verifyDeployment(
  address: string,
  constructorArgs: unknown[],
  networkName: string
) {
  const skipNetworks = new Set(["localhost", "hardhat", "hedera-testnet"]);
  if (skipNetworks.has(networkName)) {
    console.log(`Skipping Etherscan verification on ${networkName}.`);
    return;
  }

  if (!process.env.BASESCAN_API_KEY) {
    console.warn(
      "BASESCAN_API_KEY not set — skipping verification. Run `npx hardhat verify` manually once it's configured."
    );
    return;
  }

  // Give the block explorer a moment to index the deployment tx.
  const waitConfirmations = 5;
  console.log(
    `Waiting ${waitConfirmations} confirmations before verification...`
  );
  const deployTx = await hre.ethers.provider.getCode(address);
  if (deployTx === "0x") {
    throw new Error(`No code at ${address} — deployment may have failed.`);
  }
  // Small delay so the explorer sees the contract.
  await new Promise((resolve) => setTimeout(resolve, 20_000));

  try {
    console.log(`Verifying ${address} on ${networkName}...`);
    await hre.run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
    });
    console.log("Verification submitted successfully.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("already verified")) {
      console.log("Contract is already verified.");
      return;
    }
    console.error("Verification failed:", message);
    console.error(
      `You can retry manually: npx hardhat verify --network ${networkName} ${address} ${constructorArgs.join(" ")}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
