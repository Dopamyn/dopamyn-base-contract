require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, ContractFactory } = require("ethers");

async function main() {
  const rpcUrl =
    process.env.HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api";
  const privateKey = process.env.HEDERA_TESTNET_PRIVATE_KEY;
  const tokenAddress = process.env.HEDERA_TESTNET_TOKEN_ADDRESS;

  if (!privateKey) {
    throw new Error("Missing HEDERA_TESTNET_PRIVATE_KEY");
  }

  if (!tokenAddress) {
    throw new Error("Missing HEDERA_TESTNET_TOKEN_ADDRESS");
  }

  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "QuestManager.sol",
    "QuestManager.json"
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      "Missing QuestManager artifact. Run `npm run compile` first."
    );
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 1020000000000n;
  const balance = await provider.getBalance(wallet.address);
  const gasLimit = 5_000_000n;
  const estimatedUpfrontCost = gasPrice * gasLimit;

  console.log(`Deployer: ${wallet.address}`);
  console.log(`Token: ${tokenAddress}`);
  console.log(`Gas price: ${gasPrice.toString()}`);
  console.log(`Gas limit: ${gasLimit.toString()}`);
  console.log(`Balance: ${balance.toString()}`);
  console.log(`Upfront gas budget: ${estimatedUpfrontCost.toString()}`);

  if (balance <= estimatedUpfrontCost) {
    throw new Error(
      "Insufficient HBAR for deployment upfront gas budget. Fund the deployer and retry."
    );
  }

  const contract = await factory.deploy(tokenAddress, {
    gasLimit,
    gasPrice,
  });

  console.log(`Deployment tx: ${contract.deploymentTransaction().hash}`);
  await contract.waitForDeployment();
  console.log(`QuestManager deployed at: ${await contract.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
