// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract QuestManager is Ownable, Pausable, ReentrancyGuard {
    struct Quest {
        string id;
        address creator;
        address escrowAccount;
        address tokenAddress;
        uint256 amount;
        uint256 deadline;
        bool isActive;
        uint256 totalWinners;
        uint256 totalRewardDistributed;
        uint256 maxWinners;
    }

    mapping(string => Quest) public quests;
    mapping(string => mapping(address => bool)) public hasClaimedReward;
    string[] public questIds;
    mapping(address => bool) public supportedTokens;

    event QuestCreated(
        string indexed id,
        address indexed creator,
        address indexed token,
        uint256 amount,
        address escrowAccount,
        uint256 deadline,
        uint256 maxWinners
    );

    event QuestCancelled(string indexed id);
    event TokenSupported(address indexed token, bool supported);
    event RewardSent(
        string indexed questId,
        address indexed winner,
        uint256 amount
    );
    event QuestStatusUpdated(string indexed id, bool isActive);
    event RemainingRewardClaimed(
        string indexed questId,
        address indexed creator,
        uint256 amount
    );

    constructor(address _tokenAddr) Ownable(msg.sender) {
        require(_tokenAddr != address(0), "Invalid Token address");
        supportedTokens[_tokenAddr] = true;
        emit TokenSupported(_tokenAddr, true);
    }

    modifier questExists(string memory _questId) {
        require(quests[_questId].creator != address(0), "Quest does not exist");
        _;
    }

    modifier onlyActive(string memory _questId) {
        require(quests[_questId].isActive, "Quest is not active");
        _;
    }

    function addSupportedToken(address _token) external onlyOwner {
        require(_token != address(0), "Token not supported");
        supportedTokens[_token] = true;
        emit TokenSupported(_token, true);
    }

    function removeSupportedToken(address _token) external onlyOwner {
        supportedTokens[_token] = false;
        emit TokenSupported(_token, false);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function createQuest(
        string memory _questId,
        address _token,
        uint256 _amount,
        uint256 _deadline,
        uint256 _maxWinners
    ) external whenNotPaused nonReentrant returns (string memory) {
        require(supportedTokens[_token], "Token not supported");
        require(_amount > 0, "Amount must be > 0");
        require(_deadline > block.timestamp, "Deadline must be in future");
        require(_maxWinners > 0, "Max winners must be > 0");

        uint256 allowance = IERC20(_token).allowance(msg.sender, address(this));
        require(allowance >= _amount, "Insufficient allowance");

        bool transferSuccess = IERC20(_token).transferFrom(
            msg.sender,
            address(this),
            _amount
        );
        require(transferSuccess, "Token transfer failed");

        require(quests[_questId].creator == address(0), "Quest already exists");

        quests[_questId] = Quest({
            id: _questId,
            creator: msg.sender,
            escrowAccount: address(this),
            tokenAddress: _token,
            amount: _amount,
            deadline: _deadline,
            isActive: true,
            totalWinners: 0,
            totalRewardDistributed: 0,
            maxWinners: _maxWinners
        });

        questIds.push(_questId);

        emit QuestCreated(
            _questId,
            msg.sender,
            _token,
            _amount,
            address(this),
            _deadline,
            _maxWinners
        );
        return _questId;
    }

    function cancelQuest(
        string memory _questId
    )
        external
        onlyOwner
        questExists(_questId)
        onlyActive(_questId)
        whenNotPaused
        nonReentrant
    {
        Quest storage q = quests[_questId];

        uint256 balance = IERC20(q.tokenAddress).balanceOf(address(this));
        require(balance >= q.amount, "Insufficient contract token balance");

        q.isActive = false;
        bool transferSuccess = IERC20(q.tokenAddress).transfer(
            q.creator,
            q.amount
        );
        require(transferSuccess, "Token transfer failed");

        emit QuestCancelled(_questId);
    }

    function sendReward(
        string memory _questId,
        address _winner,
        uint256 _amount
    )
        external
        onlyOwner
        questExists(_questId)
        onlyActive(_questId)
        whenNotPaused
        nonReentrant
    {
        Quest storage q = quests[_questId];

        require(
            q.totalRewardDistributed + _amount <= q.amount,
            "Insufficient reward balance. Reddibuct your quest."
        );
        require(!hasClaimedReward[_questId][_winner], "Already rewarded");
        require(q.totalWinners < q.maxWinners, "Max winners limit reached");

        hasClaimedReward[_questId][_winner] = true;
        q.totalRewardDistributed += _amount;
        q.totalWinners += 1;

        bool transferSuccess = IERC20(q.tokenAddress).transfer(
            _winner,
            _amount
        );
        require(transferSuccess, "Token transfer failed");

        emit RewardSent(_questId, _winner, _amount);
    }

    function updateQuestStatus(
        string memory _questId,
        bool _newStatus
    ) external onlyOwner questExists(_questId) {
        quests[_questId].isActive = _newStatus;
        emit QuestStatusUpdated(_questId, _newStatus);
    }

    function getQuest(
        string memory _questId
    ) external view returns (Quest memory) {
        return quests[_questId];
    }

    function getAllQuestIds() external view returns (string[] memory) {
        return questIds;
    }

    function withdrawAllETH() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "ETH transfer failed");
    }

    function withdrawAllTokens(
        address _tokenAddress
    ) external onlyOwner whenNotPaused nonReentrant {
        uint256 balance = IERC20(_tokenAddress).balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");

        bool transferSuccess = IERC20(_tokenAddress).transfer(owner(), balance);
        require(transferSuccess, "Token transfer failed");
    }

    function claimRemainingReward(
        string memory _questId
    ) external questExists(_questId) whenNotPaused nonReentrant {
        Quest storage q = quests[_questId];

        // Only quest creator or admin can call this function
        require(
            msg.sender == q.creator || msg.sender == owner(),
            "Only quest creator or admin can claim remaining reward"
        );

        // Quest must be inactive (ended)
        require(!q.isActive, "Quest is still active");

        // Must wait 1 week after quest deadline
        require(
            block.timestamp >= q.deadline + 7 days,
            "Must wait 1 week after quest deadline"
        );

        // Calculate remaining unclaimed amount
        uint256 remainingAmount = q.amount - q.totalRewardDistributed;
        require(remainingAmount > 0, "No remaining reward to claim");

        // Update the quest to prevent double claiming by setting amount to distributed amount
        q.amount = q.totalRewardDistributed;

        // Transfer remaining tokens to creator
        bool transferSuccess = IERC20(q.tokenAddress).transfer(
            q.creator,
            remainingAmount
        );
        require(transferSuccess, "Token transfer failed");

        emit RemainingRewardClaimed(_questId, q.creator, remainingAmount);
    }

    receive() external payable {}
    fallback() external payable {}
}
