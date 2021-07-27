// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract WQStaking is AccessControl {
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
        uint256 startTime; //time of staking start
        uint256 distributionTime;
        uint256 unlockClaimTime;
        uint256 rewardTotal;
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

    // Common contract configuration variables.
    uint256 public rewardTotal;
    uint256 public startTime;
    uint256 public unlockClaimTime;
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
        uint256 _rewardTotal,
        uint256 _startTime,
        uint256 _distributionTime,
        uint256 _unlockClaimTime,
        address _rewardToken,
        address _stakeToken
    ) public {
        require(
            !_initialized,
            "WQStaking: Contract instance has already been initialized"
        );

        rewardTotal = _rewardTotal;
        startTime = _startTime;
        distributionTime = _distributionTime;
        unlockClaimTime = _unlockClaimTime;
        producedTime = _startTime;

        rewardToken = IERC20(_rewardToken);
        stakeToken = IERC20(_stakeToken);

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
    function stake(uint256 _amount) public {
        require(
            block.timestamp > startTime,
            "WQStaking: staking time has not come yet"
        );
        Staker storage staker = stakes[msg.sender];

        if (totalStaked > 0) {
            update();
        }
        staker.rewardDebt += (_amount * tokensPerStake) / 1e20;
        totalStaked += _amount;
        staker.amount += _amount;

        update();

        // Transfer specified amount of staking tokens to the contract
        IERC20(stakeToken).safeTransferFrom(msg.sender, address(this), _amount);

        emit tokensStaked(_amount, block.timestamp, msg.sender);
    }

    /**
     * @dev unstake - return staked amount
     *
     * Parameters:
     *
     * - `_amount` - stake amount
     */

    function unstake(uint256 _amount) public {
        require(!_entered, "WQStaking: Reentrancy guard");
        _entered = true;
        Staker storage staker = stakes[msg.sender];

        require(
            staker.amount >= _amount,
            "WQStaking: Not enough tokens to unstake"
        );

        update();

        staker.rewardAllowed += (_amount * tokensPerStake) / 1e20;
        staker.amount -= _amount;
        totalStaked -= _amount;

        IERC20(stakeToken).safeTransfer(msg.sender, _amount);

        emit tokensUnstaked(_amount, block.timestamp, msg.sender);
        _entered = false;
    }

    /**
     * @dev claim available rewards
     */
    function claim() public returns (bool) {
        require(!_entered, "WQStaking: Reentrancy guard");
        _entered = true;
        require(
            block.timestamp > unlockClaimTime,
            "WQStaking: Claiming is locked"
        );
        if (totalStaked > 0) {
            update();
        }

        uint256 reward = calcReward(msg.sender, tokensPerStake);
        require(reward > 0, "WQStaking: Nothing to claim");

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
            (staker.amount * _tps) /
            1e20 +
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
                _tps += (producedNew * 1e20) / totalStaked;
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
                tokensPerStake += (producedNew * 1e20) / totalStaked;
            }
            rewardProduced += producedNew;
        }
    }

    /**
     * @dev setReward - sets amount of reward during `distributionTime`
     */
    function setReward(uint256 _amount) external onlyRole(ADMIN_ROLE) {
        allProduced = produced();
        producedTime = block.timestamp;
        rewardTotal = _amount;
    }

    /**
     * @dev synchronizeContract - synchronize the smart contracts
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

        return (staked_, claim_, IERC20(stakeToken).balanceOf(user));
    }

    /**
     * @dev getStakingInfo - return information about the stake
     */
    function getStakingInfo() external view returns (StakeInfo memory info_) {
        info_ = StakeInfo({
            startTime: startTime,
            distributionTime: distributionTime,
            unlockClaimTime: unlockClaimTime,
            rewardTotal: rewardTotal,
            totalStaked: totalStaked,
            totalDistributed: totalDistributed,
            stakeTokenAddress: address(stakeToken),
            rewardTokenAddress: address(rewardToken)
        });

        return info_;
    }
}
