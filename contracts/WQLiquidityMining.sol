// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract WQLiquidityMining is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // Staker contains info related to each staker.
    struct Staker {
        uint256 amount; // amount of tokens currently staked to the contract
        uint256 rewardAllowed; // amount of tokens
        uint256 rewardDebt; // value needed for correct calculation staker's share
        uint256 distributed; // amount of distributed earned tokens
    }

    // StakeInfo contains info related to stake.
    struct StakeInfo {
        uint256 startTime;
        uint256 rewardTotal;
        uint256 distributionTime;
        uint256 totalStaked;
        uint256 totalDistributed;
        address stakeTokenAddress;
        address rewardTokenAddress;
    }

    // Stakers info by token holders.
    mapping(address => Staker) public stakes;

    // ERC20 token staked to the contract.
    IERC20 public stakeToken;

    // ERC20 token earned by stakers as reward.
    IERC20 public rewardToken;

    /// @notice Common contract configuration variables
    /// @notice Time of start staking
    uint256 public startTime;
    /// @notice Increase of rewards per distribution time
    uint256 public rewardTotal;
    /// @notice Distribution time
    uint256 public distributionTime;

    uint256 public tokensPerStake;
    uint256 public rewardProduced;
    uint256 public allProduced;
    uint256 public producedTime;

    uint256 public totalStaked;
    uint256 public totalDistributed;

    bool private _initialized;

    bool private _entered;

    event tokensStaked(uint256 amount, uint256 time, address indexed sender);
    event tokensClaimed(uint256 amount, uint256 time, address indexed sender);
    event tokensUnstaked(uint256 amount, uint256 time, address indexed sender);

    function initialize(
        uint256 _startTime,
        uint256 _rewardTotal,
        uint256 _distributionTime,
        address _rewardToken,
        address _stakeToken
    ) external {
        require(
            !_initialized,
            "WQLiquidityMining: Contract instance has already been initialized"
        );
        startTime = _startTime;
        rewardTotal = _rewardTotal;
        distributionTime = _distributionTime;
        rewardToken = IERC20(_rewardToken);
        stakeToken = IERC20(_stakeToken);
        producedTime = _startTime;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);

        _initialized = true;
    }

    /**
     * @dev stake `amount` of tokens to the contract
     *
     * Parameters:
     *
     * - `_amount` - stake amount
     */
    function stake(uint256 _amount) external {
        require(
            block.timestamp > startTime,
            "WQLiquidityMining: Staking time has not come yet"
        );
        Staker storage staker = stakes[msg.sender];
        if (totalStaked > 0) {
            update();
        }
        staker.rewardDebt += (_amount * tokensPerStake) / 1e18;
        totalStaked += _amount;
        staker.amount += _amount;
        // Transfer specified amount of staking tokens to the contract
        stakeToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit tokensStaked(_amount, block.timestamp, msg.sender);
    }

    /**
     * @dev unstake - return staked amount
     *
     * Parameters:
     *
     * - `_amount` - stake amount
     */

    function unstake(uint256 _amount) external {
        require(!_entered, "WQLiquidityMining: Reentrancy guard");
        _entered = true;
        Staker storage staker = stakes[msg.sender];
        require(
            staker.amount >= _amount,
            "WQLiquidityMining: Not enough tokens to unstake"
        );
        update();
        staker.rewardAllowed += (_amount * tokensPerStake) / 1e18;
        staker.amount -= _amount;
        totalStaked -= _amount;
        stakeToken.safeTransfer(msg.sender, _amount);
        emit tokensUnstaked(_amount, block.timestamp, msg.sender);
        _entered = false;
    }

    /**
     * @dev claim available rewards
     */
    function claim() external returns (bool) {
        require(!_entered, "WQLiquidityMining: Reentrancy guard");
        _entered = true;
        if (totalStaked > 0) {
            update();
        }
        uint256 reward = calcReward(msg.sender, tokensPerStake);
        require(reward > 0, "WQLiquidityMining: Nothing to claim");
        Staker storage staker = stakes[msg.sender];
        staker.distributed += reward;
        totalDistributed += reward;

        IERC20(rewardToken).safeTransfer(msg.sender, reward);
        emit tokensClaimed(reward, block.timestamp, msg.sender);
        _entered = false;
        return true;
    }

    /**
     * @dev calcReward - calculates available reward
     */
    function calcReward(address _staker, uint256 _tps)
        private
        view
        returns (uint256 reward)
    {
        Staker storage staker = stakes[_staker];

        reward =
            ((staker.amount * _tps) / 1e18) +
            staker.rewardAllowed -
            staker.distributed -
            staker.rewardDebt;

        return reward;
    }

    /**
     * @dev getClaim - returns available reward of `_staker`
     */
    function getClaim(address _staker) public view returns (uint256 reward) {
        uint256 _tps = tokensPerStake;
        if (totalStaked > 0) {
            uint256 rewardProducedAtNow = produced();
            if (rewardProducedAtNow > rewardProduced) {
                uint256 producedNew = rewardProducedAtNow - rewardProduced;
                _tps += (producedNew * 1e18) / totalStaked;
            }
        }
        reward = calcReward(_staker, _tps);

        return reward;
    }

    /**
     * @dev Calculates the necessary parameters for staking
     *
     */
    function produced() private view returns (uint256) {
        return
            allProduced +
            (rewardTotal * (block.timestamp - producedTime)) /
            distributionTime;
    }

    function update() public {
        uint256 rewardProducedAtNow = produced();
        if (rewardProducedAtNow > rewardProduced) {
            uint256 producedNew = rewardProducedAtNow - rewardProduced;
            if (totalStaked > 0) {
                tokensPerStake += (producedNew * 1e18) / totalStaked;
            }
            rewardProduced = rewardProducedAtNow;
        }
    }

    /**
     * @dev setReward - sets amount of reward during `distributionTime`
     */
    function setReward(uint256 _rewardTotal) external onlyRole(ADMIN_ROLE) {
        allProduced = produced();
        producedTime = block.timestamp;
        rewardTotal = _rewardTotal;
    }

    /**
     * @dev updateStakingInfo - synchronize the smart contracts
     */
    function updateStakingInfo(
        uint256 _tps,
        uint256 _totalStaked,
        uint256 _totalDistributed
    ) external onlyRole(ADMIN_ROLE) {
        tokensPerStake = _tps;
        totalStaked = _totalStaked;
        totalDistributed = _totalDistributed;
    }

    /**
     * @dev Set reward token and stake token addresses
     */
    function setTokens(address _rewardToken, address _stakeToken)
        external
        onlyRole(ADMIN_ROLE)
    {
        rewardToken = IERC20(_rewardToken);
        stakeToken = IERC20(_stakeToken);
    }

    function setTime(uint256 _startTime, uint256 _distributionTime)
        external
        onlyRole(ADMIN_ROLE)
    {
        startTime = _startTime;
        distributionTime = _distributionTime;
        allProduced = produced();
        producedTime = block.timestamp;
    }

    /**
     * @dev updateStakerInfo - update user information
     */
    function updateStakerInfo(
        address _user,
        uint256 _amount,
        uint256 _rewardAllowed,
        uint256 _rewardDebt,
        uint256 _distributed
    ) external onlyRole(ADMIN_ROLE) {
        Staker storage staker = stakes[_user];

        staker.amount = _amount;
        staker.rewardAllowed = _rewardAllowed;
        staker.rewardDebt = _rewardDebt;
        staker.distributed = _distributed;
    }

    /**
     * @dev getInfoByAddress - return information about the staker
     */
    function getInfoByAddress(address user)
        external
        view
        returns (
            uint256 staked_,
            uint256 claim_,
            uint256 _balance
        )
    {
        Staker storage staker = stakes[user];
        staked_ = staker.amount;
        claim_ = getClaim(user);
        return (staked_, claim_, stakeToken.balanceOf(user));
    }

    /**
     * @dev getStakingInfo - return information about the stake
     */
    function getStakingInfo() external view returns (StakeInfo memory info_) {
        info_ = StakeInfo({
            startTime: startTime,
            rewardTotal: rewardTotal,
            distributionTime: distributionTime,
            totalStaked: totalStaked,
            totalDistributed: totalDistributed,
            stakeTokenAddress: address(stakeToken),
            rewardTokenAddress: address(rewardToken)
        });
        return info_;
    }

    // ATTENTION functions below were added for testing

    function updateStartTime(uint256 _startTimeNew)
        external
        onlyRole(ADMIN_ROLE)
    {
        startTime = _startTimeNew;
    }
}
