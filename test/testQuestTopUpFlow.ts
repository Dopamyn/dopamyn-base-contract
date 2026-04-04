import hre from "hardhat";
import "dotenv/config";

const QUEST_MANAGER_ADDRESS =
  process.env.HEDERA_TESTNET_QUEST_MANAGER_ADDRESS ||
  "0x072D1B3cEED61001418Ea3cB9b39406683Dfa7D2";

const TOKEN_ADDRESS =
  process.env.HEDERA_TESTNET_LIVE_TOKEN_ADDRESS ||
  process.env.HEDERA_TESTNET_TOKEN_ADDRESS;

const CREATE_AMOUNT_INPUT = process.env.HEDERA_TESTNET_LIVE_CREATE_AMOUNT || "1";
const TOP_UP_AMOUNT_INPUT = process.env.HEDERA_TESTNET_LIVE_TOPUP_AMOUNT || "2";
const INITIAL_WINNERS = BigInt(
  process.env.HEDERA_TESTNET_LIVE_INITIAL_WINNERS || "1"
);
const ADDITIONAL_WINNERS = BigInt(
  process.env.HEDERA_TESTNET_LIVE_ADDITIONAL_WINNERS || "2"
);

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

async function main() {
  if (!TOKEN_ADDRESS) {
    throw new Error("Missing HEDERA_TESTNET_TOKEN_ADDRESS");
  }

  const [signer] = await hre.ethers.getSigners();
  const questManager = await hre.ethers.getContractAt(
    "QuestManager",
    QUEST_MANAGER_ADDRESS,
    signer
  );
  const token = new hre.ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);

  const symbol = await token.symbol();
  const decimals = await token.decimals();
  const tokenSupported = await questManager.supportedTokens(TOKEN_ADDRESS);
  const contractOwner = await questManager.owner();
  const hbarBalance = await hre.ethers.provider.getBalance(signer.address);
  const tokenBalance = await token.balanceOf(signer.address);

  const createAmount = hre.ethers.parseUnits(CREATE_AMOUNT_INPUT, decimals);
  const topUpAmount = hre.ethers.parseUnits(TOP_UP_AMOUNT_INPUT, decimals);
  const totalApproval = createAmount + topUpAmount;
  const questId = `hedera-live-${Date.now()}`;
  const deadline = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

  const txOverrides = {
    gasPrice: 1_020_000_000_000n,
  };

  console.log(`Signer: ${signer.address}`);
  console.log(`Contract: ${QUEST_MANAGER_ADDRESS}`);
  console.log(`Owner: ${contractOwner}`);
  console.log(`Token: ${TOKEN_ADDRESS}`);
  console.log(`Token symbol: ${symbol}`);
  console.log(`Token decimals: ${decimals}`);
  console.log(`Token supported: ${tokenSupported}`);
  console.log(`Create amount input: ${CREATE_AMOUNT_INPUT}`);
  console.log(`Top-up amount input: ${TOP_UP_AMOUNT_INPUT}`);
  console.log(`Initial winners: ${INITIAL_WINNERS.toString()}`);
  console.log(`Additional winners: ${ADDITIONAL_WINNERS.toString()}`);
  console.log(`HBAR balance: ${hbarBalance.toString()}`);
  console.log(`Token balance: ${tokenBalance.toString()}`);

  if (!tokenSupported) {
    throw new Error("Configured token is not supported by QuestManager");
  }

  if (tokenBalance < totalApproval) {
    throw new Error(
      `Insufficient ${symbol} balance for live test. Need ${totalApproval.toString()}, have ${tokenBalance.toString()}`
    );
  }

  const currentAllowance = await token.allowance(
    signer.address,
    QUEST_MANAGER_ADDRESS
  );

  if (currentAllowance < totalApproval) {
    console.log(`Approving ${totalApproval.toString()} ${symbol}...`);
    const approveTx = await token.approve(
      QUEST_MANAGER_ADDRESS,
      totalApproval,
      {
        ...txOverrides,
        gasLimit: 1_000_000,
      }
    );
    const approveReceipt = await approveTx.wait();
    console.log(`Approve tx: ${approveReceipt?.hash}`);
  } else {
    console.log(`Existing allowance is sufficient: ${currentAllowance.toString()}`);
  }

  console.log(
    `Creating quest ${questId} for ${CREATE_AMOUNT_INPUT} ${symbol} and ${INITIAL_WINNERS.toString()} winner(s)...`
  );
  const createTx = await questManager.createQuest(
    questId,
    TOKEN_ADDRESS,
    createAmount,
    deadline,
    INITIAL_WINNERS,
    {
      ...txOverrides,
      gasLimit: 5_000_000,
    }
  );
  const createReceipt = await createTx.wait();
  console.log(`Create tx: ${createReceipt?.hash}`);

  const createdQuest = await questManager.getQuest(questId);
  console.log("Quest after create:");
  console.log(
    JSON.stringify(
      {
        id: createdQuest.id,
        creator: createdQuest.creator,
        tokenAddress: createdQuest.tokenAddress,
        amount: createdQuest.amount.toString(),
        deadline: createdQuest.deadline.toString(),
        isActive: createdQuest.isActive,
        totalWinners: createdQuest.totalWinners.toString(),
        totalRewardDistributed: createdQuest.totalRewardDistributed.toString(),
        maxWinners: createdQuest.maxWinners.toString(),
      },
      null,
      2
    )
  );

  console.log(
    `Topping up quest by ${TOP_UP_AMOUNT_INPUT} ${symbol} and ${ADDITIONAL_WINNERS.toString()} winner(s)...`
  );
  const topUpTx = await questManager.topUpQuest(
    questId,
    TOKEN_ADDRESS,
    topUpAmount,
    ADDITIONAL_WINNERS,
    {
      ...txOverrides,
      gasLimit: 5_000_000,
    }
  );
  const topUpReceipt = await topUpTx.wait();
  console.log(`Top-up tx: ${topUpReceipt?.hash}`);

  const toppedUpQuest = await questManager.getQuest(questId);
  console.log("Quest after top-up:");
  console.log(
    JSON.stringify(
      {
        id: toppedUpQuest.id,
        creator: toppedUpQuest.creator,
        tokenAddress: toppedUpQuest.tokenAddress,
        amount: toppedUpQuest.amount.toString(),
        deadline: toppedUpQuest.deadline.toString(),
        isActive: toppedUpQuest.isActive,
        totalWinners: toppedUpQuest.totalWinners.toString(),
        totalRewardDistributed: toppedUpQuest.totalRewardDistributed.toString(),
        maxWinners: toppedUpQuest.maxWinners.toString(),
      },
      null,
      2
    )
  );

  console.log(`Live quest flow complete for questId=${questId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
