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
    mapping(string => mapping(address => uint256)) public rewardAmountClaimed; // Track accumulated reward amounts
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
    event ReferrerRewardSent(
        string indexed questId,
        address indexed referrer,
        uint256 amount
    );
    event QuestStatusUpdated(string indexed id, bool isActive);
    event RemainingRewardClaimed(
        string indexed questId,
        address indexed creator,
        uint256 amount
    );

    constructor(address _tokenAddress) Ownable(msg.sender) {
        require(_tokenAddress != address(0), "Invalid Token address");
        supportedTokens[_tokenAddress] = true;
        emit TokenSupported(_tokenAddress, true);
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
        require(_token != address(0), "Invalid token");
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
        uint256 _mainWinnerAmount,
        address[] memory _referrerWinners,
        uint256[] memory _referrerAmounts,
        bool _skipClaimedCheck
    )
        external
        onlyOwner
        questExists(_questId)
        onlyActive(_questId)
        whenNotPaused
        nonReentrant
    {
        Quest storage q = quests[_questId];

        // Validate referrer arrays match
        require(
            _referrerWinners.length == _referrerAmounts.length,
            "Referrer winners and amounts arrays must have the same length"
        );

        // Prevent DoS by limiting referrer array size
        require(_referrerWinners.length <= 50, "Too many referrers (max 50)");

        // Calculate total reward amount
        uint256 referrerTotal = 0;
        for (uint256 i = 0; i < _referrerAmounts.length; i++) {
            referrerTotal += _referrerAmounts[i];
        }

        uint256 totalRewardAmount = _mainWinnerAmount + referrerTotal;
        require(totalRewardAmount > 0, "Total reward amount must be > 0");

        require(
            q.totalRewardDistributed + totalRewardAmount <= q.amount,
            "Insufficient reward balance. Reddibuct your quest."
        );

        // Check if main winner has already claimed (only if skip_claimed_check is false)
        if (!_skipClaimedCheck) {
            require(!hasClaimedReward[_questId][_winner], "Already rewarded");
        }

        require(q.totalWinners < q.maxWinners, "Max winners limit reached");

        // Update quest state
        q.totalRewardDistributed += totalRewardAmount;

        // Only increment total_winners if this is the first time claiming for this winner
        if (!hasClaimedReward[_questId][_winner]) {
            q.totalWinners += 1;
        }

        // Initialize or update reward claimed account for main winner
        hasClaimedReward[_questId][_winner] = true;
        rewardAmountClaimed[_questId][_winner] += _mainWinnerAmount; // Accumulate reward amount for multiple sends

        // Transfer reward tokens to main winner
        if (_mainWinnerAmount > 0) {
            bool transferSuccess = IERC20(q.tokenAddress).transfer(
                _winner,
                _mainWinnerAmount
            );
            require(transferSuccess, "Token transfer failed");
            emit RewardSent(_questId, _winner, _mainWinnerAmount);
        }

        // Transfer reward tokens to each referrer
        for (uint256 i = 0; i < _referrerWinners.length; i++) {
            if (_referrerAmounts[i] > 0) {
                bool referrerTransferSuccess = IERC20(q.tokenAddress).transfer(
                    _referrerWinners[i],
                    _referrerAmounts[i]
                );
                require(
                    referrerTransferSuccess,
                    "Referrer token transfer failed"
                );
                emit ReferrerRewardSent(
                    _questId,
                    _referrerWinners[i],
                    _referrerAmounts[i]
                );
            }
        }
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

    function getRewardAmountClaimed(
        string memory _questId,
        address _winner
    ) external view returns (uint256) {
        return rewardAmountClaimed[_questId][_winner];
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

        // Calculate total escrowed amount for active quests using this token
        uint256 totalEscrowed = 0;
        for (uint256 i = 0; i < questIds.length; i++) {
            Quest storage q = quests[questIds[i]];
            if (q.tokenAddress == _tokenAddress && q.isActive) {
                // Escrowed amount is the remaining unclaimed amount
                uint256 remainingEscrowed = q.amount - q.totalRewardDistributed;
                totalEscrowed += remainingEscrowed;
            }
        }

        // Only allow withdrawal of non-escrowed tokens
        require(
            balance > totalEscrowed,
            "All tokens are escrowed for active quests"
        );
        uint256 withdrawableAmount = balance - totalEscrowed;

        bool transferSuccess = IERC20(_tokenAddress).transfer(
            owner(),
            withdrawableAmount
        );
        require(transferSuccess, "Token transfer failed");
    }

    function sendReferrerRewards(
        string memory _questId,
        address[] memory _referrerWinners,
        uint256[] memory _referrerAmounts
    )
        external
        onlyOwner
        questExists(_questId)
        onlyActive(_questId)
        whenNotPaused
        nonReentrant
    {
        Quest storage q = quests[_questId];

        // Validate referrer arrays match
        require(
            _referrerWinners.length == _referrerAmounts.length,
            "Referrer winners and amounts arrays must have the same length"
        );

        // Prevent DoS by limiting referrer array size
        require(_referrerWinners.length <= 50, "Too many referrers (max 50)");

        // Calculate total referrer reward amount
        uint256 referrerTotal = 0;
        for (uint256 i = 0; i < _referrerAmounts.length; i++) {
            referrerTotal += _referrerAmounts[i];
        }

        require(referrerTotal > 0, "Total referrer reward amount must be > 0");

        require(
            q.totalRewardDistributed + referrerTotal <= q.amount,
            "Insufficient reward balance. Reddibuct your quest."
        );

        // Update quest state
        q.totalRewardDistributed += referrerTotal;

        // Transfer reward tokens to each referrer
        for (uint256 i = 0; i < _referrerWinners.length; i++) {
            if (_referrerAmounts[i] > 0) {
                bool referrerTransferSuccess = IERC20(q.tokenAddress).transfer(
                    _referrerWinners[i],
                    _referrerAmounts[i]
                );
                require(
                    referrerTransferSuccess,
                    "Referrer token transfer failed"
                );
                emit ReferrerRewardSent(
                    _questId,
                    _referrerWinners[i],
                    _referrerAmounts[i]
                );
            }
        }
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
