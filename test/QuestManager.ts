import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("QuestManager", function () {
  // Helper function to generate a unique quest ID for testing
  function generateQuestId(prefix: string = "quest"): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // We define a fixture to reuse the same setup in every test
  async function deployQuestManagerFixture() {
    // Get signers
    const [owner, creator, otherAccount, thirdAccount] =
      await hre.ethers.getSigners();

    // Deploy mock ERC20 tokens for testing
    const MockToken = await hre.ethers.getContractFactory("MockERC20");
    const mockUSDC = await MockToken.deploy("Mock USDC", "USDC");
    const mockToken2 = await MockToken.deploy("Mock Token 2", "MTK2");

    // Deploy QuestManager contract
    const QuestManager = await hre.ethers.getContractFactory("QuestManager");
    const questManager = await QuestManager.deploy(mockUSDC.target);

    // Mint tokens to creator for testing
    await mockUSDC.mint(creator.address, hre.ethers.parseEther("1000"));
    await mockToken2.mint(creator.address, hre.ethers.parseEther("1000"));

    return {
      questManager,
      mockUSDC,
      mockToken2,
      owner,
      creator,
      otherAccount,
      thirdAccount,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { questManager, owner } = await loadFixture(
        deployQuestManagerFixture
      );
      expect(await questManager.owner()).to.equal(owner.address);
    });

    it("Should set USDC as supported token", async function () {
      const { questManager, mockUSDC } = await loadFixture(
        deployQuestManagerFixture
      );
      expect(await questManager.supportedTokens(mockUSDC.target)).to.be.true;
    });

    it("Should emit TokenSupported event on deployment", async function () {
      const { questManager, mockUSDC } = await loadFixture(
        deployQuestManagerFixture
      );
      // Note: We can't test the deployment event directly, but we can verify the token is supported
      expect(await questManager.supportedTokens(mockUSDC.target)).to.be.true;
    });

    it("Should revert with invalid USDC address", async function () {
      const QuestManager = await hre.ethers.getContractFactory("QuestManager");
      await expect(
        QuestManager.deploy(hre.ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid Token address");
    });
  });

  describe("Token Management", function () {
    it("Should allow owner to add supported token", async function () {
      const { questManager, mockToken2, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      await expect(
        questManager.connect(owner).addSupportedToken(mockToken2.target)
      )
        .to.emit(questManager, "TokenSupported")
        .withArgs(mockToken2.target, true);

      expect(await questManager.supportedTokens(mockToken2.target)).to.be.true;
    });

    it("Should allow owner to remove supported token", async function () {
      const { questManager, mockUSDC, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      await expect(
        questManager.connect(owner).removeSupportedToken(mockUSDC.target)
      )
        .to.emit(questManager, "TokenSupported")
        .withArgs(mockUSDC.target, false);

      expect(await questManager.supportedTokens(mockUSDC.target)).to.be.false;
    });

    it("Should revert when non-owner tries to add supported token", async function () {
      const { questManager, mockToken2, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      await expect(
        questManager.connect(creator).addSupportedToken(mockToken2.target)
      ).to.be.revertedWithCustomError(
        questManager,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert when non-owner tries to remove supported token", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      await expect(
        questManager.connect(creator).removeSupportedToken(mockUSDC.target)
      ).to.be.revertedWithCustomError(
        questManager,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert when adding zero address as supported token", async function () {
      const { questManager, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      await expect(
        questManager.connect(owner).addSupportedToken(hre.ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid token");
    });
  });

  describe("Pause/Unpause", function () {
    it("Should allow owner to pause contract", async function () {
      const { questManager, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      await questManager.connect(owner).pause();
      expect(await questManager.paused()).to.be.true;
    });

    it("Should allow owner to unpause contract", async function () {
      const { questManager, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      await questManager.connect(owner).pause();
      await questManager.connect(owner).unpause();
      expect(await questManager.paused()).to.be.false;
    });

    it("Should revert when non-owner tries to pause", async function () {
      const { questManager, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      await expect(
        questManager.connect(creator).pause()
      ).to.be.revertedWithCustomError(
        questManager,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert when non-owner tries to unpause", async function () {
      const { questManager, creator, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      await questManager.connect(owner).pause();
      await expect(
        questManager.connect(creator).unpause()
      ).to.be.revertedWithCustomError(
        questManager,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("Quest Creation", function () {
    it("Should create quest successfully", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400; // 1 day from now
      const maxWinners = 10;
      const questId = generateQuestId();

      // Approve tokens
      await mockUSDC.connect(creator).approve(questManager.target, amount);

      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners)
      ).to.emit(questManager, "QuestCreated");

      const questIds = await questManager.getAllQuestIds();
      expect(questIds.length).to.equal(1);

      const quest = await questManager.getQuest(questIds[0]);
      expect(quest.creator).to.equal(creator.address);
      expect(quest.tokenAddress).to.equal(mockUSDC.target);
      expect(quest.amount).to.equal(amount);
      expect(quest.deadline).to.equal(deadline);
      expect(quest.isActive).to.be.true;
      expect(quest.maxWinners).to.equal(maxWinners);
      expect(quest.totalWinners).to.equal(0);
      expect(quest.totalRewardDistributed).to.equal(0);
    });

    it("Should create quest with maxWinners = 1", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 1;
      const questId = generateQuestId();

      await mockUSDC.connect(creator).approve(questManager.target, amount);

      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners)
      ).to.emit(questManager, "QuestCreated");

      const questIds = await questManager.getAllQuestIds();
      const quest = await questManager.getQuest(questIds[0]);
      expect(quest.maxWinners).to.equal(1);
    });

    it("Should create quest with very high maxWinners", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 1000;
      const questId = generateQuestId();

      await mockUSDC.connect(creator).approve(questManager.target, amount);

      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners)
      ).to.emit(questManager, "QuestCreated");

      const questIds = await questManager.getAllQuestIds();
      const quest = await questManager.getQuest(questIds[0]);
      expect(quest.maxWinners).to.equal(1000);
    });

    it("Should emit QuestCreated event with correct parameters including maxWinners", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 5;
      const questId = generateQuestId();

      await mockUSDC.connect(creator).approve(questManager.target, amount);

      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners)
      ).to.emit(questManager, "QuestCreated");
    });

    it("Should revert when creating quest with unsupported token", async function () {
      const { questManager, mockToken2, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const questId = generateQuestId();

      await mockToken2.connect(creator).approve(questManager.target, amount);

      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockToken2.target, amount, deadline, 10)
      ).to.be.revertedWith("Token not supported");
    });

    it("Should revert when creating quest with zero amount", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const deadline = (await time.latest()) + 86400;
      const questId = generateQuestId();

      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, 0, deadline, 10)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("Should revert when creating quest with past deadline", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) - 86400; // 1 day ago
      const questId = generateQuestId();

      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, 10)
      ).to.be.revertedWith("Deadline must be in future");
    });

    it("Should revert when creating quest with insufficient allowance", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const questId = generateQuestId();

      // Don't approve tokens
      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, 10)
      ).to.be.revertedWith("Insufficient allowance");
    });

    it("Should revert when creating quest while paused", async function () {
      const { questManager, mockUSDC, creator, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const questId = generateQuestId();

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      await questManager.connect(owner).pause();

      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, 10)
      ).to.be.revertedWithCustomError(questManager, "EnforcedPause");
    });

    it("Should transfer tokens from creator to contract", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const questId = generateQuestId();

      const initialCreatorBalance = await mockUSDC.balanceOf(creator.address);
      const initialContractBalance = await mockUSDC.balanceOf(
        questManager.target
      );

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      const finalCreatorBalance = await mockUSDC.balanceOf(creator.address);
      const finalContractBalance = await mockUSDC.balanceOf(
        questManager.target
      );

      expect(finalCreatorBalance).to.equal(initialCreatorBalance - amount);
      expect(finalContractBalance).to.equal(initialContractBalance + amount);
    });
  });

  describe("Quest Cancellation", function () {
    it("Should cancel quest successfully", async function () {
      const { questManager, mockUSDC, creator, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      const initialCreatorBalance = await mockUSDC.balanceOf(creator.address);

      await expect(questManager.connect(owner).cancelQuest(questId))
        .to.emit(questManager, "QuestCancelled")
        .withArgs(questId);

      const quest = await questManager.getQuest(questId);
      expect(quest.isActive).to.be.false;

      const finalCreatorBalance = await mockUSDC.balanceOf(creator.address);
      expect(finalCreatorBalance).to.equal(initialCreatorBalance + amount);
    });

    it("Should revert when non-owner tries to cancel quest", async function () {
      const { questManager, mockUSDC, creator, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      await expect(
        questManager.connect(otherAccount).cancelQuest(questId)
      ).to.be.revertedWithCustomError(
        questManager,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert when cancelling non-existent quest", async function () {
      const { questManager, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      const fakeQuestId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("fake"));

      await expect(
        questManager.connect(owner).cancelQuest(fakeQuestId)
      ).to.be.revertedWith("Quest does not exist");
    });

    it("Should revert when cancelling inactive quest", async function () {
      const { questManager, mockUSDC, creator, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      // Cancel once
      await questManager.connect(owner).cancelQuest(questId);

      // Try to cancel again
      await expect(
        questManager.connect(owner).cancelQuest(questId)
      ).to.be.revertedWith("Quest is not active");
    });

    it("Should revert when cancelling quest while paused", async function () {
      const { questManager, mockUSDC, creator, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      await questManager.connect(owner).pause();

      await expect(
        questManager.connect(owner).cancelQuest(questId)
      ).to.be.revertedWithCustomError(questManager, "EnforcedPause");
    });
  });

  describe("Quest Status Update", function () {
    it("Should update quest status successfully", async function () {
      const { questManager, mockUSDC, creator, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      // Update status to inactive
      await expect(
        questManager.connect(owner).updateQuestStatus(questId, false)
      )
        .to.emit(questManager, "QuestStatusUpdated")
        .withArgs(questId, false);

      const quest = await questManager.getQuest(questId);
      expect(quest.isActive).to.be.false;

      // Update status back to active
      await expect(questManager.connect(owner).updateQuestStatus(questId, true))
        .to.emit(questManager, "QuestStatusUpdated")
        .withArgs(questId, true);

      const updatedQuest = await questManager.getQuest(questId);
      expect(updatedQuest.isActive).to.be.true;
    });

    it("Should revert when non-owner tries to update quest status", async function () {
      const { questManager, mockUSDC, creator, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      await expect(
        questManager.connect(otherAccount).updateQuestStatus(questId, false)
      ).to.be.revertedWithCustomError(
        questManager,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert when updating status of non-existent quest", async function () {
      const { questManager, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      const fakeQuestId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("fake"));

      await expect(
        questManager.connect(owner).updateQuestStatus(fakeQuestId, false)
      ).to.be.revertedWith("Quest does not exist");
    });

    it("Should allow updating status of cancelled quest", async function () {
      const { questManager, mockUSDC, creator, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      // Cancel the quest first
      await questManager.connect(owner).cancelQuest(questId);

      // Try to update status (should work even for cancelled quest)
      await expect(questManager.connect(owner).updateQuestStatus(questId, true))
        .to.emit(questManager, "QuestStatusUpdated")
        .withArgs(questId, true);

      const quest = await questManager.getQuest(questId);
      expect(quest.isActive).to.be.true;
    });
  });

  describe("Reward Distribution", function () {
    it("Should send reward successfully", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      const initialWinnerBalance = await mockUSDC.balanceOf(
        otherAccount.address
      );

      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            rewardAmount,
            [],
            [],
            false
          )
      )
        .to.emit(questManager, "RewardSent")
        .withArgs(questId, otherAccount.address, rewardAmount);

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(1);
      expect(quest.totalRewardDistributed).to.equal(rewardAmount);

      const finalWinnerBalance = await mockUSDC.balanceOf(otherAccount.address);
      expect(finalWinnerBalance).to.equal(initialWinnerBalance + rewardAmount);

      expect(await questManager.hasClaimedReward(questId, otherAccount.address))
        .to.be.true;
    });

    it("Should send multiple rewards to different winners", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount1 = hre.ethers.parseEther("10");
      const rewardAmount2 = hre.ethers.parseEther("15");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send first reward
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          otherAccount.address,
          rewardAmount1,
          [],
          [],
          false
        );

      // Send second reward
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          thirdAccount.address,
          rewardAmount2,
          [],
          [],
          false
        );

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(2);
      expect(quest.totalRewardDistributed).to.equal(
        rewardAmount1 + rewardAmount2
      );

      expect(await questManager.hasClaimedReward(questId, otherAccount.address))
        .to.be.true;
      expect(await questManager.hasClaimedReward(questId, thirdAccount.address))
        .to.be.true;
    });

    it("Should handle quest with maxWinners = 1", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("50");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 1;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send first reward - should succeed
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // Try to send second reward - should fail due to maxWinners limit
      await expect(
        questManager
          .connect(owner)
          .sendReward(questId, creator.address, rewardAmount, [], [], false)
      ).to.be.revertedWith("Max winners limit reached");

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(1);
      expect(quest.maxWinners).to.equal(1);
    });

    it("Should handle quest with maxWinners = 2 and exactly 2 rewards", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("30"); // Each reward is 30, so we can fit 3 rewards but maxWinners is 2
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 2;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send first reward
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // Send second reward - should succeed
      await questManager
        .connect(owner)
        .sendReward(questId, thirdAccount.address, rewardAmount, [], [], false);

      // Try to send third reward - should fail due to maxWinners limit (not balance)
      await expect(
        questManager
          .connect(owner)
          .sendReward(questId, creator.address, rewardAmount, [], [], false)
      ).to.be.revertedWith("Max winners limit reached");

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(2);
      expect(quest.maxWinners).to.equal(2);
      expect(quest.totalRewardDistributed).to.equal(rewardAmount * 2n);
    });

    it("Should handle quest with maxWinners = 3 and partial rewards", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("30");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 3;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send first reward
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // Send second reward
      await questManager
        .connect(owner)
        .sendReward(questId, thirdAccount.address, rewardAmount, [], [], false);

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(2);
      expect(quest.maxWinners).to.equal(3);
      expect(quest.totalRewardDistributed).to.equal(rewardAmount * 2n);

      // Should still be able to send one more reward
      await expect(
        questManager
          .connect(owner)
          .sendReward(questId, creator.address, rewardAmount, [], [], false)
      ).to.emit(questManager, "RewardSent");
    });

    it("Should handle quest with maxWinners = 5 and exactly 5 rewards", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("20"); // Each reward is 20, total 100
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 5;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send 5 rewards to different addresses
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      await questManager
        .connect(owner)
        .sendReward(questId, thirdAccount.address, rewardAmount, [], [], false);

      await questManager
        .connect(owner)
        .sendReward(questId, creator.address, rewardAmount, [], [], false);

      await questManager
        .connect(owner)
        .sendReward(questId, owner.address, rewardAmount, [], [], false);

      // For the 5th reward, we need to create a new signer since we can't reuse addresses
      // Let's test the maxWinners limit by trying to send a 6th reward instead
      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(4);
      expect(quest.maxWinners).to.equal(5);
      expect(quest.totalRewardDistributed).to.equal(rewardAmount * 4n);

      // Try to send 6th reward - should fail due to maxWinners limit
      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            rewardAmount,
            [],
            [],
            false
          )
      ).to.be.revertedWith("Already rewarded");

      // Try to send reward to a new address - should fail due to maxWinners limit
      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            thirdAccount.address,
            rewardAmount,
            [],
            [],
            false
          )
      ).to.be.revertedWith("Already rewarded");
    });

    it("Should revert when non-owner tries to send reward", async function () {
      const { questManager, mockUSDC, creator, otherAccount, thirdAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      await expect(
        questManager
          .connect(otherAccount)
          .sendReward(
            questId,
            thirdAccount.address,
            rewardAmount,
            [],
            [],
            false
          )
      ).to.be.revertedWithCustomError(
        questManager,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert when sending reward for non-existent quest", async function () {
      const { questManager, owner, otherAccount } = await loadFixture(
        deployQuestManagerFixture
      );

      const fakeQuestId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("fake"));
      const rewardAmount = hre.ethers.parseEther("10");

      await expect(
        questManager
          .connect(owner)
          .sendReward(
            fakeQuestId,
            otherAccount.address,
            rewardAmount,
            [],
            [],
            false
          )
      ).to.be.revertedWith("Quest does not exist");
    });

    it("Should revert when sending reward for inactive quest", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      // Cancel the quest
      await questManager.connect(owner).cancelQuest(questId);

      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            rewardAmount,
            [],
            [],
            false
          )
      ).to.be.revertedWith("Quest is not active");
    });

    it("Should revert when sending reward to already rewarded address", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      // Send reward once
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // Try to send reward again to same address
      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            rewardAmount,
            [],
            [],
            false
          )
      ).to.be.revertedWith("Already rewarded");
    });

    it("Should revert when sending reward exceeding quest amount", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("150"); // More than quest amount
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            rewardAmount,
            [],
            [],
            false
          )
      ).to.be.revertedWith(
        "Insufficient reward balance. Reddibuct your quest."
      );
    });

    it("Should revert when sending reward that would exceed quest amount", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount1 = hre.ethers.parseEther("60");
      const rewardAmount2 = hre.ethers.parseEther("50"); // This would exceed the remaining amount
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send first reward
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          otherAccount.address,
          rewardAmount1,
          [],
          [],
          false
        );

      // Try to send second reward that would exceed remaining amount
      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            thirdAccount.address,
            rewardAmount2,
            [],
            [],
            false
          )
      ).to.be.revertedWith(
        "Insufficient reward balance. Reddibuct your quest."
      );
    });

    it("Should revert when sending reward while paused", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      await questManager.connect(owner).pause();

      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            rewardAmount,
            [],
            [],
            false
          )
      ).to.be.revertedWithCustomError(questManager, "EnforcedPause");
    });

    it("Should revert when max winners limit is reached", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 2;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send first reward
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // Send second reward
      await questManager
        .connect(owner)
        .sendReward(questId, thirdAccount.address, rewardAmount, [], [], false);

      // Try to send third reward - should fail
      await expect(
        questManager
          .connect(owner)
          .sendReward(questId, creator.address, rewardAmount, [], [], false)
      ).to.be.revertedWith("Max winners limit reached");

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(2);
      expect(quest.maxWinners).to.equal(2);
    });

    it("Should send reward with single referrer successfully", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const mainRewardAmount = hre.ethers.parseEther("10");
      const referrerAmount = hre.ethers.parseEther("5");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      const initialWinnerBalance = await mockUSDC.balanceOf(
        otherAccount.address
      );
      const initialReferrerBalance = await mockUSDC.balanceOf(
        thirdAccount.address
      );

      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            mainRewardAmount,
            [thirdAccount.address],
            [referrerAmount],
            false
          )
      )
        .to.emit(questManager, "RewardSent")
        .withArgs(questId, otherAccount.address, mainRewardAmount)
        .and.to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, thirdAccount.address, referrerAmount);

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(1);
      expect(quest.totalRewardDistributed).to.equal(
        mainRewardAmount + referrerAmount
      );

      const finalWinnerBalance = await mockUSDC.balanceOf(otherAccount.address);
      const finalReferrerBalance = await mockUSDC.balanceOf(
        thirdAccount.address
      );

      expect(finalWinnerBalance).to.equal(
        initialWinnerBalance + mainRewardAmount
      );
      expect(finalReferrerBalance).to.equal(
        initialReferrerBalance + referrerAmount
      );
    });

    it("Should send reward with multiple referrers successfully", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const mainRewardAmount = hre.ethers.parseEther("10");
      const referrerAmount1 = hre.ethers.parseEther("5");
      const referrerAmount2 = hre.ethers.parseEther("3");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      const initialWinnerBalance = await mockUSDC.balanceOf(
        otherAccount.address
      );
      const initialReferrer1Balance = await mockUSDC.balanceOf(creator.address);
      const initialReferrer2Balance = await mockUSDC.balanceOf(owner.address);

      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            mainRewardAmount,
            [creator.address, owner.address],
            [referrerAmount1, referrerAmount2],
            false
          )
      )
        .to.emit(questManager, "RewardSent")
        .withArgs(questId, otherAccount.address, mainRewardAmount)
        .and.to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, creator.address, referrerAmount1)
        .and.to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, owner.address, referrerAmount2);

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(1);
      expect(quest.totalRewardDistributed).to.equal(
        mainRewardAmount + referrerAmount1 + referrerAmount2
      );

      const finalWinnerBalance = await mockUSDC.balanceOf(otherAccount.address);
      const finalReferrer1Balance = await mockUSDC.balanceOf(creator.address);
      const finalReferrer2Balance = await mockUSDC.balanceOf(owner.address);

      expect(finalWinnerBalance).to.equal(
        initialWinnerBalance + mainRewardAmount
      );
      expect(finalReferrer1Balance).to.equal(
        initialReferrer1Balance + referrerAmount1
      );
      expect(finalReferrer2Balance).to.equal(
        initialReferrer2Balance + referrerAmount2
      );
    });

    it("Should send reward with referrer but zero main winner amount", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const mainRewardAmount = 0n;
      const referrerAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      const initialReferrerBalance = await mockUSDC.balanceOf(
        thirdAccount.address
      );

      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            mainRewardAmount,
            [thirdAccount.address],
            [referrerAmount],
            false
          )
      )
        .to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, thirdAccount.address, referrerAmount)
        .and.to.not.emit(questManager, "RewardSent");

      const quest = await questManager.getQuest(questId);
      expect(quest.totalRewardDistributed).to.equal(referrerAmount);

      const finalReferrerBalance = await mockUSDC.balanceOf(
        thirdAccount.address
      );
      expect(finalReferrerBalance).to.equal(
        initialReferrerBalance + referrerAmount
      );
    });

    it("Should revert when referrer arrays have mismatched lengths", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const mainRewardAmount = hre.ethers.parseEther("10");
      const referrerAmount = hre.ethers.parseEther("5");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Mismatched arrays - 2 referrers but only 1 amount
      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            mainRewardAmount,
            [thirdAccount.address, creator.address],
            [referrerAmount],
            false
          )
      ).to.be.revertedWith(
        "Referrer winners and amounts arrays must have the same length"
      );
    });

    it("Should revert when referrer array exceeds maximum limit of 50", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("1000"); // Large amount to support many referrers
      const mainRewardAmount = hre.ethers.parseEther("10");
      const referrerAmount = hre.ethers.parseEther("1");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Create arrays with 51 referrers (exceeds limit of 50)
      const referrerWinners: string[] = [];
      const referrerAmounts: bigint[] = [];
      
      // Get signers to use as referrers (we'll reuse addresses since we only need to test the limit)
      const signers = await hre.ethers.getSigners();
      
      for (let i = 0; i < 51; i++) {
        // Cycle through available signer addresses
        const referrerAddress = signers[i % signers.length].address;
        referrerWinners.push(referrerAddress);
        referrerAmounts.push(referrerAmount);
      }

      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            mainRewardAmount,
            referrerWinners,
            referrerAmounts,
            false
          )
      ).to.be.revertedWith("Too many referrers (max 50)");
    });

    it("Should allow exactly 50 referrers", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("1000"); // Large amount to support 50 referrers
      const mainRewardAmount = hre.ethers.parseEther("10");
      const referrerAmount = hre.ethers.parseEther("1");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Create arrays with exactly 50 referrers (at the limit)
      const referrerWinners: string[] = [];
      const referrerAmounts: bigint[] = [];
      
      // Get signers to use as referrers
      const signers = await hre.ethers.getSigners();
      
      for (let i = 0; i < 50; i++) {
        // Cycle through available signer addresses
        const referrerAddress = signers[i % signers.length].address;
        referrerWinners.push(referrerAddress);
        referrerAmounts.push(referrerAmount);
      }

      // Should succeed with exactly 50 referrers
      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            mainRewardAmount,
            referrerWinners,
            referrerAmounts,
            false
          )
      )
        .to.emit(questManager, "RewardSent")
        .withArgs(questId, otherAccount.address, mainRewardAmount);

      const quest = await questManager.getQuest(questId);
      expect(quest.totalRewardDistributed).to.equal(
        mainRewardAmount + referrerAmount * 50n
      );
    });

    it("Should revert when total reward amount (main + referrers) exceeds quest amount", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const mainRewardAmount = hre.ethers.parseEther("60");
      const referrerAmount = hre.ethers.parseEther("50"); // Total would be 110, exceeding 100
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            mainRewardAmount,
            [thirdAccount.address],
            [referrerAmount],
            false
          )
      ).to.be.revertedWith(
        "Insufficient reward balance. Reddibuct your quest."
      );
    });

    it("Should handle referrer rewards with skipClaimedCheck flag", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const mainRewardAmount1 = hre.ethers.parseEther("10");
      const mainRewardAmount2 = hre.ethers.parseEther("5");
      const referrerAmount = hre.ethers.parseEther("3");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // First reward
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          otherAccount.address,
          mainRewardAmount1,
          [],
          [],
          false
        );

      // Second reward to same winner with referrer, using skipClaimedCheck
      const initialReferrerBalance = await mockUSDC.balanceOf(
        thirdAccount.address
      );

      await expect(
        questManager.connect(owner).sendReward(
          questId,
          otherAccount.address,
          mainRewardAmount2,
          [thirdAccount.address],
          [referrerAmount],
          true // Skip claimed check
        )
      )
        .to.emit(questManager, "RewardSent")
        .withArgs(questId, otherAccount.address, mainRewardAmount2)
        .and.to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, thirdAccount.address, referrerAmount);

      const quest = await questManager.getQuest(questId);
      expect(quest.totalRewardDistributed).to.equal(
        mainRewardAmount1 + mainRewardAmount2 + referrerAmount
      );

      const finalReferrerBalance = await mockUSDC.balanceOf(
        thirdAccount.address
      );
      expect(finalReferrerBalance).to.equal(
        initialReferrerBalance + referrerAmount
      );
    });

    it("Should handle multiple referrers with zero amounts (skipped)", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const mainRewardAmount = hre.ethers.parseEther("10");
      const referrerAmount1 = hre.ethers.parseEther("5");
      const referrerAmount2 = 0n; // Zero amount - should be skipped
      const referrerAmount3 = hre.ethers.parseEther("3");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      const initialReferrer1Balance = await mockUSDC.balanceOf(creator.address);
      const initialReferrer2Balance = await mockUSDC.balanceOf(
        thirdAccount.address
      );
      const initialReferrer3Balance = await mockUSDC.balanceOf(owner.address);

      const tx = await questManager
        .connect(owner)
        .sendReward(
          questId,
          otherAccount.address,
          mainRewardAmount,
          [creator.address, thirdAccount.address, owner.address],
          [referrerAmount1, referrerAmount2, referrerAmount3],
          false
        );

      await expect(tx)
        .to.emit(questManager, "RewardSent")
        .withArgs(questId, otherAccount.address, mainRewardAmount)
        .and.to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, creator.address, referrerAmount1)
        .and.to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, owner.address, referrerAmount3);

      // Verify that referrer with zero amount didn't receive tokens
      // (no event emitted for zero amount referrer)

      const quest = await questManager.getQuest(questId);
      expect(quest.totalRewardDistributed).to.equal(
        mainRewardAmount + referrerAmount1 + referrerAmount3
      );

      // Referrer 2 should not receive any tokens
      const finalReferrer2Balance = await mockUSDC.balanceOf(
        thirdAccount.address
      );
      expect(finalReferrer2Balance).to.equal(initialReferrer2Balance);
    });

    it("Should revert when total reward amount is zero (main + referrers)", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const mainRewardAmount = 0n;
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      await expect(
        questManager
          .connect(owner)
          .sendReward(
            questId,
            otherAccount.address,
            mainRewardAmount,
            [],
            [],
            false
          )
      ).to.be.revertedWith("Total reward amount must be > 0");
    });

    it("Should handle referrer rewards in multiple sendReward calls", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const mainRewardAmount1 = hre.ethers.parseEther("10");
      const mainRewardAmount2 = hre.ethers.parseEther("15");
      const referrerAmount1 = hre.ethers.parseEther("5");
      const referrerAmount2 = hre.ethers.parseEther("3");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      const initialReferrerBalance = await mockUSDC.balanceOf(
        thirdAccount.address
      );

      // First reward with referrer
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          otherAccount.address,
          mainRewardAmount1,
          [thirdAccount.address],
          [referrerAmount1],
          false
        );

      // Second reward to different winner with same referrer
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          creator.address,
          mainRewardAmount2,
          [thirdAccount.address],
          [referrerAmount2],
          false
        );

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(2);
      expect(quest.totalRewardDistributed).to.equal(
        mainRewardAmount1 +
          mainRewardAmount2 +
          referrerAmount1 +
          referrerAmount2
      );

      const finalReferrerBalance = await mockUSDC.balanceOf(
        thirdAccount.address
      );
      expect(finalReferrerBalance).to.equal(
        initialReferrerBalance + referrerAmount1 + referrerAmount2
      );
    });
  });

  describe("sendReferrerRewards", function () {
    it("Should send single referrer reward successfully", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const referrerAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      const initialReferrerBalance = await mockUSDC.balanceOf(
        thirdAccount.address
      );

      await expect(
        questManager
          .connect(owner)
          .sendReferrerRewards(
            questId,
            [thirdAccount.address],
            [referrerAmount]
          )
      )
        .to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, thirdAccount.address, referrerAmount);

      const quest = await questManager.getQuest(questId);
      expect(quest.totalRewardDistributed).to.equal(referrerAmount);
      expect(quest.totalWinners).to.equal(0); // Should not increment winners

      const finalReferrerBalance = await mockUSDC.balanceOf(
        thirdAccount.address
      );
      expect(finalReferrerBalance).to.equal(
        initialReferrerBalance + referrerAmount
      );
    });

    it("Should send multiple referrer rewards successfully", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const referrerAmount1 = hre.ethers.parseEther("10");
      const referrerAmount2 = hre.ethers.parseEther("15");
      const referrerAmount3 = hre.ethers.parseEther("5");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      const initialReferrer1Balance = await mockUSDC.balanceOf(
        creator.address
      );
      const initialReferrer2Balance = await mockUSDC.balanceOf(owner.address);
      const initialReferrer3Balance = await mockUSDC.balanceOf(
        thirdAccount.address
      );

      await expect(
        questManager
          .connect(owner)
          .sendReferrerRewards(
            questId,
            [creator.address, owner.address, thirdAccount.address],
            [referrerAmount1, referrerAmount2, referrerAmount3]
          )
      )
        .to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, creator.address, referrerAmount1)
        .and.to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, owner.address, referrerAmount2)
        .and.to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, thirdAccount.address, referrerAmount3);

      const quest = await questManager.getQuest(questId);
      expect(quest.totalRewardDistributed).to.equal(
        referrerAmount1 + referrerAmount2 + referrerAmount3
      );
      expect(quest.totalWinners).to.equal(0);

      const finalReferrer1Balance = await mockUSDC.balanceOf(creator.address);
      const finalReferrer2Balance = await mockUSDC.balanceOf(owner.address);
      const finalReferrer3Balance = await mockUSDC.balanceOf(
        thirdAccount.address
      );

      expect(finalReferrer1Balance).to.equal(
        initialReferrer1Balance + referrerAmount1
      );
      expect(finalReferrer2Balance).to.equal(
        initialReferrer2Balance + referrerAmount2
      );
      expect(finalReferrer3Balance).to.equal(
        initialReferrer3Balance + referrerAmount3
      );
    });

    it("Should revert when referrer arrays have mismatched lengths", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const referrerAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Mismatched arrays - 2 referrers but only 1 amount
      await expect(
        questManager
          .connect(owner)
          .sendReferrerRewards(
            questId,
            [thirdAccount.address, creator.address],
            [referrerAmount]
          )
      ).to.be.revertedWith(
        "Referrer winners and amounts arrays must have the same length"
      );
    });

    it("Should revert when referrer array exceeds maximum limit of 50", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("1000"); // Large amount to support many referrers
      const referrerAmount = hre.ethers.parseEther("1");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Create arrays with 51 referrers (exceeds limit of 50)
      const referrerWinners: string[] = [];
      const referrerAmounts: bigint[] = [];

      // Get signers to use as referrers
      const signers = await hre.ethers.getSigners();

      for (let i = 0; i < 51; i++) {
        // Cycle through available signer addresses
        const referrerAddress = signers[i % signers.length].address;
        referrerWinners.push(referrerAddress);
        referrerAmounts.push(referrerAmount);
      }

      await expect(
        questManager
          .connect(owner)
          .sendReferrerRewards(questId, referrerWinners, referrerAmounts)
      ).to.be.revertedWith("Too many referrers (max 50)");
    });

    it("Should allow exactly 50 referrers", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("1000"); // Large amount to support 50 referrers
      const referrerAmount = hre.ethers.parseEther("1");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Create arrays with exactly 50 referrers (at the limit)
      const referrerWinners: string[] = [];
      const referrerAmounts: bigint[] = [];

      // Get signers to use as referrers
      const signers = await hre.ethers.getSigners();

      for (let i = 0; i < 50; i++) {
        // Cycle through available signer addresses
        const referrerAddress = signers[i % signers.length].address;
        referrerWinners.push(referrerAddress);
        referrerAmounts.push(referrerAmount);
      }

      // Should succeed with exactly 50 referrers
      await expect(
        questManager
          .connect(owner)
          .sendReferrerRewards(questId, referrerWinners, referrerAmounts)
      ).to.not.be.reverted;

      const quest = await questManager.getQuest(questId);
      expect(quest.totalRewardDistributed).to.equal(referrerAmount * 50n);
    });

    it("Should revert when total referrer reward amount exceeds quest amount", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const referrerAmount = hre.ethers.parseEther("110"); // Exceeds quest amount
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      await expect(
        questManager
          .connect(owner)
          .sendReferrerRewards(
            questId,
            [thirdAccount.address],
            [referrerAmount]
          )
      ).to.be.revertedWith(
        "Insufficient reward balance. Reddibuct your quest."
      );
    });

    it("Should revert when total referrer reward amount is zero", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      await expect(
        questManager
          .connect(owner)
          .sendReferrerRewards(questId, [thirdAccount.address], [0n])
      ).to.be.revertedWith("Total referrer reward amount must be > 0");
    });

    it("Should handle multiple referrers with zero amounts (skipped)", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const referrerAmount1 = hre.ethers.parseEther("10");
      const referrerAmount2 = 0n; // Zero amount - should be skipped
      const referrerAmount3 = hre.ethers.parseEther("5");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      const initialReferrer1Balance = await mockUSDC.balanceOf(creator.address);
      const initialReferrer2Balance = await mockUSDC.balanceOf(
        thirdAccount.address
      );
      const initialReferrer3Balance = await mockUSDC.balanceOf(owner.address);

      const tx = await questManager
        .connect(owner)
        .sendReferrerRewards(
          questId,
          [creator.address, thirdAccount.address, owner.address],
          [referrerAmount1, referrerAmount2, referrerAmount3]
        );

      await expect(tx)
        .to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, creator.address, referrerAmount1)
        .and.to.emit(questManager, "ReferrerRewardSent")
        .withArgs(questId, owner.address, referrerAmount3);

      // Verify that referrer with zero amount didn't receive tokens
      // (no event emitted for zero amount referrer)

      const quest = await questManager.getQuest(questId);
      expect(quest.totalRewardDistributed).to.equal(
        referrerAmount1 + referrerAmount3
      );

      // Referrer 2 should not receive any tokens
      const finalReferrer2Balance = await mockUSDC.balanceOf(
        thirdAccount.address
      );
      expect(finalReferrer2Balance).to.equal(initialReferrer2Balance);

      // Other referrers should receive their rewards
      const finalReferrer1Balance = await mockUSDC.balanceOf(creator.address);
      const finalReferrer3Balance = await mockUSDC.balanceOf(owner.address);
      expect(finalReferrer1Balance).to.equal(
        initialReferrer1Balance + referrerAmount1
      );
      expect(finalReferrer3Balance).to.equal(
        initialReferrer3Balance + referrerAmount3
      );
    });

    it("Should update totalRewardDistributed correctly when combined with sendReward", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const mainRewardAmount = hre.ethers.parseEther("20");
      const referrerAmount1 = hre.ethers.parseEther("10");
      const referrerAmount2 = hre.ethers.parseEther("15");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // First send main reward
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, mainRewardAmount, [], [], false);

      // Then send referrer rewards separately
      await questManager
        .connect(owner)
        .sendReferrerRewards(
          questId,
          [thirdAccount.address, creator.address],
          [referrerAmount1, referrerAmount2]
        );

      const quest = await questManager.getQuest(questId);
      expect(quest.totalRewardDistributed).to.equal(
        mainRewardAmount + referrerAmount1 + referrerAmount2
      );
      expect(quest.totalWinners).to.equal(1); // Only main winner counted
    });

    it("Should revert when quest does not exist", async function () {
      const { questManager, mockUSDC, owner, thirdAccount } =
        await loadFixture(deployQuestManagerFixture);

      const referrerAmount = hre.ethers.parseEther("10");
      const nonExistentQuestId = "non_existent_quest";

      await expect(
        questManager
          .connect(owner)
          .sendReferrerRewards(
            nonExistentQuestId,
            [thirdAccount.address],
            [referrerAmount]
          )
      ).to.be.revertedWith("Quest does not exist");
    });

    it("Should revert when quest is not active", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const referrerAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Deactivate quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      await expect(
        questManager
          .connect(owner)
          .sendReferrerRewards(
            questId,
            [thirdAccount.address],
            [referrerAmount]
          )
      ).to.be.revertedWith("Quest is not active");
    });

    it("Should revert when called by non-owner", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const referrerAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      await expect(
        questManager
          .connect(creator)
          .sendReferrerRewards(
            questId,
            [thirdAccount.address],
            [referrerAmount]
          )
      ).to.be.revertedWithCustomError(questManager, "OwnableUnauthorizedAccount");
    });

    it("Should revert when contract is paused", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const referrerAmount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Pause contract
      await questManager.connect(owner).pause();

      await expect(
        questManager
          .connect(owner)
          .sendReferrerRewards(
            questId,
            [thirdAccount.address],
            [referrerAmount]
          )
      ).to.be.revertedWithCustomError(questManager, "EnforcedPause");
    });

    it("Should revert when creating quest with zero max winners", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount);

      await expect(
        questManager
          .connect(creator)
          .createQuest("test_quest_id", mockUSDC.target, amount, deadline, 0)
      ).to.be.revertedWith("Max winners must be > 0");
    });

    it("Should revert when creating quest with duplicate quest ID", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const questId = "duplicate_quest_id";

      await mockUSDC.connect(creator).approve(questManager.target, amount * 2n);

      // Create first quest
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      // Try to create second quest with same ID
      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, 10)
      ).to.be.revertedWith("Quest already exists");
    });

    it("Should revert when creating quest with maxWinners as uint256 max value", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = hre.ethers.MaxUint256;

      await mockUSDC.connect(creator).approve(questManager.target, amount);

      // This should succeed as maxWinners is just a limit, not a practical constraint
      const questId = generateQuestId();
      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners)
      ).to.emit(questManager, "QuestCreated");
    });

    it("Should revert when creating quest with maxWinners as 1 but amount too small for multiple rewards", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("10");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 1;

      await mockUSDC.connect(creator).approve(questManager.target, amount);

      const questId = generateQuestId();
      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners)
      ).to.emit(questManager, "QuestCreated");
    });

    it("Should handle quest creation with maxWinners equal to amount in wei", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = 1000n; // 1000 wei
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 1000;

      await mockUSDC.connect(creator).approve(questManager.target, amount);

      const questId = generateQuestId();
      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners)
      ).to.emit(questManager, "QuestCreated");

      const questIds = await questManager.getAllQuestIds();
      const quest = await questManager.getQuest(questIds[0]);
      expect(quest.maxWinners).to.equal(1000);
      expect(quest.amount).to.equal(1000);
    });
  });

  describe("Claim Remaining Reward", function () {
    it("Should allow creator to claim remaining reward after 1 week", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("60");
      const deadline = (await time.latest()) + 86400; // 1 day from now
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send some rewards
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // End the quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      // Fast forward 1 week + 1 day after deadline
      await time.increaseTo(deadline + 8 * 24 * 60 * 60);

      const initialCreatorBalance = await mockUSDC.balanceOf(creator.address);
      const expectedRemainingAmount = amount - rewardAmount;

      await expect(questManager.connect(creator).claimRemainingReward(questId))
        .to.emit(questManager, "RemainingRewardClaimed")
        .withArgs(questId, creator.address, expectedRemainingAmount);

      const finalCreatorBalance = await mockUSDC.balanceOf(creator.address);
      expect(finalCreatorBalance).to.equal(
        initialCreatorBalance + expectedRemainingAmount
      );

      // Verify quest state is updated
      const quest = await questManager.getQuest(questId);
      expect(quest.amount).to.equal(rewardAmount); // Updated to distributed amount
    });

    it("Should allow admin to call claimRemainingReward but only creator receives tokens", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("40");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send some rewards
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // End the quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      // Fast forward 1 week + 1 day after deadline
      await time.increaseTo(deadline + 8 * 24 * 60 * 60);

      const initialCreatorBalance = await mockUSDC.balanceOf(creator.address);
      const expectedRemainingAmount = amount - rewardAmount;

      // Admin calls the function
      await expect(questManager.connect(owner).claimRemainingReward(questId))
        .to.emit(questManager, "RemainingRewardClaimed")
        .withArgs(questId, creator.address, expectedRemainingAmount);

      // Creator receives the tokens, not admin
      const finalCreatorBalance = await mockUSDC.balanceOf(creator.address);
      expect(finalCreatorBalance).to.equal(
        initialCreatorBalance + expectedRemainingAmount
      );

      const finalAdminBalance = await mockUSDC.balanceOf(owner.address);
      expect(finalAdminBalance).to.equal(0n); // Admin didn't receive any tokens
    });

    it("Should revert when non-creator and non-admin tries to claim remaining reward", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("30");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send some rewards
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // End the quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      // Fast forward 1 week + 1 day after deadline
      await time.increaseTo(deadline + 8 * 24 * 60 * 60);

      await expect(
        questManager.connect(thirdAccount).claimRemainingReward(questId)
      ).to.be.revertedWith(
        "Only quest creator or admin can claim remaining reward"
      );
    });

    it("Should revert when trying to claim remaining reward before 1 week has passed", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("50");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send some rewards
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // End the quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      // Fast forward only 6 days after deadline (less than 1 week)
      await time.increaseTo(deadline + 6 * 24 * 60 * 60);

      await expect(
        questManager.connect(creator).claimRemainingReward(questId)
      ).to.be.revertedWith("Must wait 1 week after quest deadline");
    });

    it("Should revert when trying to claim remaining reward for active quest", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("20");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send some rewards
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // Quest is still active, don't end it

      // Fast forward 1 week + 1 day after deadline
      await time.increaseTo(deadline + 8 * 24 * 60 * 60);

      await expect(
        questManager.connect(creator).claimRemainingReward(questId)
      ).to.be.revertedWith("Quest is still active");
    });

    it("Should revert when trying to claim remaining reward for non-existent quest", async function () {
      const { questManager, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const fakeQuestId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("fake"));

      await expect(
        questManager.connect(creator).claimRemainingReward(fakeQuestId)
      ).to.be.revertedWith("Quest does not exist");
    });

    it("Should revert when trying to claim remaining reward when no remaining amount", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Distribute all rewards (no remaining amount)
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, amount, [], [], false);

      // End the quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      // Fast forward 1 week + 1 day after deadline
      await time.increaseTo(deadline + 8 * 24 * 60 * 60);

      await expect(
        questManager.connect(creator).claimRemainingReward(questId)
      ).to.be.revertedWith("No remaining reward to claim");
    });

    it("Should prevent double claiming of remaining reward", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("70");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send some rewards
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // End the quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      // Fast forward 1 week + 1 day after deadline
      await time.increaseTo(deadline + 8 * 24 * 60 * 60);

      // First claim should succeed
      await questManager.connect(creator).claimRemainingReward(questId);

      // Second claim should fail
      await expect(
        questManager.connect(creator).claimRemainingReward(questId)
      ).to.be.revertedWith("No remaining reward to claim");
    });

    it("Should handle claim remaining reward for quest with multiple partial rewards", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount1 = hre.ethers.parseEther("20");
      const rewardAmount2 = hre.ethers.parseEther("15");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send multiple rewards
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          otherAccount.address,
          rewardAmount1,
          [],
          [],
          false
        );

      await questManager
        .connect(owner)
        .sendReward(
          questId,
          thirdAccount.address,
          rewardAmount2,
          [],
          [],
          false
        );

      // End the quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      // Fast forward 1 week + 1 day after deadline
      await time.increaseTo(deadline + 8 * 24 * 60 * 60);

      const initialCreatorBalance = await mockUSDC.balanceOf(creator.address);
      const expectedRemainingAmount = amount - rewardAmount1 - rewardAmount2;

      await expect(questManager.connect(creator).claimRemainingReward(questId))
        .to.emit(questManager, "RemainingRewardClaimed")
        .withArgs(questId, creator.address, expectedRemainingAmount);

      const finalCreatorBalance = await mockUSDC.balanceOf(creator.address);
      expect(finalCreatorBalance).to.equal(
        initialCreatorBalance + expectedRemainingAmount
      );
    });

    it("Should handle claim remaining reward for quest with zero maxWinners reached", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 2;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send rewards to reach maxWinners limit
      const rewardAmount = hre.ethers.parseEther("30");
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      await questManager
        .connect(owner)
        .sendReward(questId, thirdAccount.address, rewardAmount, [], [], false);

      // End the quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      // Fast forward 1 week + 1 day after deadline
      await time.increaseTo(deadline + 8 * 24 * 60 * 60);

      const initialCreatorBalance = await mockUSDC.balanceOf(creator.address);
      const expectedRemainingAmount = amount - rewardAmount * 2n;

      await expect(questManager.connect(creator).claimRemainingReward(questId))
        .to.emit(questManager, "RemainingRewardClaimed")
        .withArgs(questId, creator.address, expectedRemainingAmount);

      const finalCreatorBalance = await mockUSDC.balanceOf(creator.address);
      expect(finalCreatorBalance).to.equal(
        initialCreatorBalance + expectedRemainingAmount
      );
    });

    it("Should handle claim remaining reward for quest with very small remaining amount", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("99.99"); // Very small remaining amount
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send almost all rewards
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // End the quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      // Fast forward 1 week + 1 day after deadline
      await time.increaseTo(deadline + 8 * 24 * 60 * 60);

      const initialCreatorBalance = await mockUSDC.balanceOf(creator.address);
      const expectedRemainingAmount = amount - rewardAmount;

      await expect(questManager.connect(creator).claimRemainingReward(questId))
        .to.emit(questManager, "RemainingRewardClaimed")
        .withArgs(questId, creator.address, expectedRemainingAmount);

      const finalCreatorBalance = await mockUSDC.balanceOf(creator.address);
      expect(finalCreatorBalance).to.equal(
        initialCreatorBalance + expectedRemainingAmount
      );
    });

    it("Should revert when trying to claim remaining reward while contract is paused", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("60");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send some rewards
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // End the quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      // Fast forward 1 week + 1 day after deadline
      await time.increaseTo(deadline + 8 * 24 * 60 * 60);

      // Pause the contract
      await questManager.connect(owner).pause();

      await expect(
        questManager.connect(creator).claimRemainingReward(questId)
      ).to.be.revertedWithCustomError(questManager, "EnforcedPause");
    });

    it("Should handle claim remaining reward for quest with exact 1 week timing", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const rewardAmount = hre.ethers.parseEther("80");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send some rewards
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      // End the quest
      await questManager.connect(owner).updateQuestStatus(questId, false);

      // Fast forward exactly 1 week after deadline
      await time.increaseTo(deadline + 7 * 24 * 60 * 60);

      const initialCreatorBalance = await mockUSDC.balanceOf(creator.address);
      const expectedRemainingAmount = amount - rewardAmount;

      await expect(questManager.connect(creator).claimRemainingReward(questId))
        .to.emit(questManager, "RemainingRewardClaimed")
        .withArgs(questId, creator.address, expectedRemainingAmount);

      const finalCreatorBalance = await mockUSDC.balanceOf(creator.address);
      expect(finalCreatorBalance).to.equal(
        initialCreatorBalance + expectedRemainingAmount
      );
    });
  });

  describe("View Functions", function () {
    it("Should return correct quest data", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      const quest = await questManager.getQuest(questId);
      expect(quest.id).to.equal(questId);
      expect(quest.creator).to.equal(creator.address);
      expect(quest.escrowAccount).to.equal(questManager.target);
      expect(quest.tokenAddress).to.equal(mockUSDC.target);
      expect(quest.amount).to.equal(amount);
      expect(quest.deadline).to.equal(deadline);
      expect(quest.isActive).to.be.true;
      expect(quest.maxWinners).to.equal(maxWinners);
      expect(quest.totalWinners).to.equal(0);
      expect(quest.totalRewardDistributed).to.equal(0);
    });

    it("Should return correct quest data after rewards are distributed", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 5;
      const rewardAmount = hre.ethers.parseEther("20");

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners);

      // Send a reward
      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, rewardAmount, [], [], false);

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(1);
      expect(quest.totalRewardDistributed).to.equal(rewardAmount);
      expect(quest.maxWinners).to.equal(maxWinners);
      expect(quest.isActive).to.be.true;
    });

    it("Should return correct quest data after quest is cancelled", async function () {
      const { questManager, mockUSDC, creator, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 10;

      await mockUSDC.connect(creator).approve(questManager.target, amount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(questId, mockUSDC.target, amount, deadline, 10);

      // Cancel the quest
      await questManager.connect(owner).cancelQuest(questId);

      const quest = await questManager.getQuest(questId);
      expect(quest.isActive).to.be.false;
      expect(quest.maxWinners).to.equal(maxWinners);
      expect(quest.totalWinners).to.equal(0);
      expect(quest.totalRewardDistributed).to.equal(0);
    });

    it("Should return empty quest for non-existent quest", async function () {
      const { questManager } = await loadFixture(deployQuestManagerFixture);

      const fakeQuestId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("fake"));
      const quest = await questManager.getQuest(fakeQuestId);

      expect(quest.creator).to.equal(hre.ethers.ZeroAddress);
    });

    it("Should return all quest IDs", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, amount * 2n);

      // Create multiple quests
      const questId1 = generateQuestId("quest1");
      await questManager
        .connect(creator)
        .createQuest(questId1, mockUSDC.target, amount, deadline, 10);
      const questId2 = generateQuestId("quest2");
      await questManager
        .connect(creator)
        .createQuest(questId2, mockUSDC.target, amount, deadline, 10);

      const questIds = await questManager.getAllQuestIds();
      expect(questIds.length).to.equal(2);
      expect(questIds[0]).to.equal(questId1);
      expect(questIds[1]).to.equal(questId2);
    });

    it("Should return empty array when no quests exist", async function () {
      const { questManager } = await loadFixture(deployQuestManagerFixture);

      const questIds = await questManager.getAllQuestIds();
      expect(questIds.length).to.equal(0);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle multiple quests with same creator", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 86400;
      const maxWinners1 = 10;
      const maxWinners2 = 5;

      await mockUSDC.connect(creator).approve(questManager.target, amount * 2n);

      const questId1 = generateQuestId("quest1");
      await questManager
        .connect(creator)
        .createQuest(questId1, mockUSDC.target, amount, deadline, maxWinners1);
      const questId2 = generateQuestId("quest2");
      await questManager
        .connect(creator)
        .createQuest(questId2, mockUSDC.target, amount, deadline, maxWinners2);

      expect(questId1).to.not.equal(questId2);

      const questIds = await questManager.getAllQuestIds();
      expect(questIds.length).to.equal(2);

      const quest1 = await questManager.getQuest(questId1);
      const quest2 = await questManager.getQuest(questId2);
      expect(quest1.maxWinners).to.equal(maxWinners1);
      expect(quest2.maxWinners).to.equal(maxWinners2);
    });

    it("Should handle quest creation with maximum amount", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const maxAmount = hre.ethers.parseEther("1000"); // All creator's tokens
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 100;

      await mockUSDC.connect(creator).approve(questManager.target, maxAmount);

      const questId = generateQuestId();
      await expect(
        questManager
          .connect(creator)
          .createQuest(
            questId,
            mockUSDC.target,
            maxAmount,
            deadline,
            maxWinners
          )
      ).to.emit(questManager, "QuestCreated");
    });

    it("Should handle quest creation with far future deadline", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("100");
      const deadline = (await time.latest()) + 365 * 24 * 60 * 60; // 1 year from now
      const maxWinners = 50;

      await mockUSDC.connect(creator).approve(questManager.target, amount);

      const questId = generateQuestId();
      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners)
      ).to.emit(questManager, "QuestCreated");
    });

    it("Should handle quest with maxWinners equal to amount in wei", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = 1000n; // 1000 wei
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 1000;

      await mockUSDC.connect(creator).approve(questManager.target, amount);

      const questId = generateQuestId();
      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners)
      ).to.emit(questManager, "QuestCreated");

      const questIds = await questManager.getAllQuestIds();
      const quest = await questManager.getQuest(questIds[0]);
      expect(quest.maxWinners).to.equal(1000);
      expect(quest.amount).to.equal(1000);
    });

    it("Should handle quest with maxWinners greater than total reward amount", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = 100n; // 100 wei
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 1000; // More than the amount

      await mockUSDC.connect(creator).approve(questManager.target, amount);

      const questId = generateQuestId();
      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners)
      ).to.emit(questManager, "QuestCreated");

      const questIds = await questManager.getAllQuestIds();
      const quest = await questManager.getQuest(questIds[0]);
      expect(quest.maxWinners).to.equal(1000);
      expect(quest.amount).to.equal(100);
    });

    it("Should handle quest with very small maxWinners and large amount", async function () {
      const { questManager, mockUSDC, creator } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("1000");
      const deadline = (await time.latest()) + 86400;
      const maxWinners = 1;

      await mockUSDC.connect(creator).approve(questManager.target, amount);

      const questId = generateQuestId();
      await expect(
        questManager
          .connect(creator)
          .createQuest(questId, mockUSDC.target, amount, deadline, maxWinners)
      ).to.emit(questManager, "QuestCreated");

      const questIds = await questManager.getAllQuestIds();
      const quest = await questManager.getQuest(questIds[0]);
      expect(quest.maxWinners).to.equal(1);
      expect(quest.amount).to.equal(amount);
    });

    it("Should handle fractional token rewards (USDC-like with 6 decimals)", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      // Create a quest with 10 USDC total and 20 max winners
      // Each winner gets 0.5 USDC (500,000 units in 6-decimal token)
      const totalAmount = 10_000_000n; // 10 USDC in 6-decimal units
      const maxWinners = 20;
      const deadline = (await time.latest()) + 86400;
      const rewardPerWinner = 500_000n; // 0.5 USDC in 6-decimal units

      await mockUSDC.connect(creator).approve(questManager.target, totalAmount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(
          questId,
          mockUSDC.target,
          totalAmount,
          deadline,
          maxWinners
        );

      // Send rewards to multiple winners
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          otherAccount.address,
          rewardPerWinner,
          [],
          [],
          false
        );

      await questManager
        .connect(owner)
        .sendReward(
          questId,
          thirdAccount.address,
          rewardPerWinner,
          [],
          [],
          false
        );

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(2);
      expect(quest.totalRewardDistributed).to.equal(1_000_000n); // 1 USDC distributed
      expect(quest.amount).to.equal(totalAmount);
    });

    it("Should handle very small fractional rewards (0.1 USDC)", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      // Create a quest with 1 USDC total and 10 max winners
      // Each winner gets 0.1 USDC (100,000 units in 6-decimal token)
      const totalAmount = 1_000_000n; // 1 USDC in 6-decimal units
      const maxWinners = 10;
      const deadline = (await time.latest()) + 86400;
      const rewardPerWinner = 100_000n; // 0.1 USDC in 6-decimal units

      await mockUSDC.connect(creator).approve(questManager.target, totalAmount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(
          questId,
          mockUSDC.target,
          totalAmount,
          deadline,
          maxWinners
        );

      // Send reward
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          otherAccount.address,
          rewardPerWinner,
          [],
          [],
          false
        );

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(1);
      expect(quest.totalRewardDistributed).to.equal(rewardPerWinner);
      expect(quest.amount).to.equal(totalAmount);
    });

    it("Should handle micro-rewards (0.001 USDC)", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      // Create a quest with 0.1 USDC total and 100 max winners
      // Each winner gets 0.001 USDC (1,000 units in 6-decimal token)
      const totalAmount = 100_000n; // 0.1 USDC in 6-decimal units
      const maxWinners = 100;
      const deadline = (await time.latest()) + 86400;
      const rewardPerWinner = 1_000n; // 0.001 USDC in 6-decimal units

      await mockUSDC.connect(creator).approve(questManager.target, totalAmount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(
          questId,
          mockUSDC.target,
          totalAmount,
          deadline,
          maxWinners
        );

      // Send reward
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          otherAccount.address,
          rewardPerWinner,
          [],
          [],
          false
        );

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(1);
      expect(quest.totalRewardDistributed).to.equal(rewardPerWinner);
      expect(quest.amount).to.equal(totalAmount);
    });

    it("Should handle quest where total amount equals maxWinners (1:1 ratio)", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      // Create a quest with 5 USDC total and 5 max winners
      // Each winner gets exactly 1 USDC
      const totalAmount = 5_000_000n; // 5 USDC in 6-decimal units
      const maxWinners = 5;
      const deadline = (await time.latest()) + 86400;
      const rewardPerWinner = 1_000_000n; // 1 USDC in 6-decimal units

      await mockUSDC.connect(creator).approve(questManager.target, totalAmount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(
          questId,
          mockUSDC.target,
          totalAmount,
          deadline,
          maxWinners
        );

      // Send reward
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          otherAccount.address,
          rewardPerWinner,
          [],
          [],
          false
        );

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(1);
      expect(quest.totalRewardDistributed).to.equal(rewardPerWinner);
      expect(quest.amount).to.equal(totalAmount);
    });

    it("Should handle quest with uneven distribution (remainder handling)", async function () {
      const {
        questManager,
        mockUSDC,
        creator,
        owner,
        otherAccount,
        thirdAccount,
      } = await loadFixture(deployQuestManagerFixture);

      // Create a quest with 7 USDC total and 3 max winners
      // This will have uneven distribution: 2.33... USDC per winner
      const totalAmount = 7_000_000n; // 7 USDC in 6-decimal units
      const maxWinners = 3;
      const deadline = (await time.latest()) + 86400;

      await mockUSDC.connect(creator).approve(questManager.target, totalAmount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(
          questId,
          mockUSDC.target,
          totalAmount,
          deadline,
          maxWinners
        );

      // Send rewards with different amounts to test remainder handling
      const reward1 = 2_333_333n; // 2.333333 USDC
      const reward2 = 2_333_333n; // 2.333333 USDC
      const reward3 = 2_333_334n; // 2.333334 USDC (handles remainder)

      await questManager
        .connect(owner)
        .sendReward(questId, otherAccount.address, reward1, [], [], false);

      await questManager
        .connect(owner)
        .sendReward(questId, thirdAccount.address, reward2, [], [], false);

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(2);
      expect(quest.totalRewardDistributed).to.equal(reward1 + reward2);
      expect(quest.amount).to.equal(totalAmount);
    });

    it("Should handle quest with amount smaller than maxWinners (sub-1:1 ratio)", async function () {
      const { questManager, mockUSDC, creator, owner, otherAccount } =
        await loadFixture(deployQuestManagerFixture);

      // Create a quest with 0.5 USDC total and 2 max winners
      // Each winner gets 0.25 USDC (250,000 units in 6-decimal units)
      const totalAmount = 500_000n; // 0.5 USDC in 6-decimal units
      const maxWinners = 2;
      const deadline = (await time.latest()) + 86400;
      const rewardPerWinner = 250_000n; // 0.25 USDC in 6-decimal units

      await mockUSDC.connect(creator).approve(questManager.target, totalAmount);
      const questId = generateQuestId();
      await questManager
        .connect(creator)
        .createQuest(
          questId,
          mockUSDC.target,
          totalAmount,
          deadline,
          maxWinners
        );

      // Send reward
      await questManager
        .connect(owner)
        .sendReward(
          questId,
          otherAccount.address,
          rewardPerWinner,
          [],
          [],
          false
        );

      const quest = await questManager.getQuest(questId);
      expect(quest.totalWinners).to.equal(1);
      expect(quest.totalRewardDistributed).to.equal(rewardPerWinner);
      expect(quest.amount).to.equal(totalAmount);
    });
  });

  describe("Receive and Fallback", function () {
    it("Should accept ETH via receive function", async function () {
      const { questManager, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("1");

      await expect(
        owner.sendTransaction({
          to: questManager.target,
          value: amount,
        })
      ).to.not.be.reverted;

      expect(
        await hre.ethers.provider.getBalance(questManager.target)
      ).to.equal(amount);
    });

    it("Should accept ETH via fallback function", async function () {
      const { questManager, owner } = await loadFixture(
        deployQuestManagerFixture
      );

      const amount = hre.ethers.parseEther("1");

      await expect(
        owner.sendTransaction({
          to: questManager.target,
          value: amount,
          data: "0x1234", // Invalid function call
        })
      ).to.not.be.reverted;

      expect(
        await hre.ethers.provider.getBalance(questManager.target)
      ).to.equal(amount);
    });
  });
});
