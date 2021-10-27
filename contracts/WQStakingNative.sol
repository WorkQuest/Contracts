// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';

contract WQStakingNative is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using AddressUpgradeable for address payable;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    // Staker contains info related to each staker.
    struct Staker {
        uint256 amount; // amount of tokens currently staked to the contract
        uint256 rewardAllowed; // amount of tokens
        uint256 rewardDebt; // value needed for correct calculation staker's share
        uint256 distributed; // amount of distributed earned tokens
        uint256 stakedAt; // timestamp of last stake
        uint256 claimedAt; // timestamp of last claim
    }

    // StakeInfo contains info related to stake.
    struct StakeInfo {
        uint256 startTime;
        uint256 rewardTotal;
        uint256 distributionTime;
        uint256 stakePeriod;
        uint256 claimPeriod;
        uint256 minStake;
        uint256 maxStake;
        uint256 totalStaked;
        uint256 totalDistributed;
    }

    /// @notice Common contract configuration variables
    /// @notice Time of start staking
    uint256 public startTime;
    /// @notice Increase of rewards per distribution time
    uint256 public rewardTotal;
    /// @notice Distribution time
    uint256 public distributionTime;
    /// @notice Staking period
    uint256 public stakePeriod;
    /// @notice Claiming rewards period
    uint256 public claimPeriod;
    /// @notice minimal stake amount
    uint256 public minStake;
    /// @notice maximal stake amount
    uint256 public maxStake;

    uint256 public tokensPerStake;
    uint256 public rewardProduced;
    uint256 public earlierProduced;
    uint256 public producedTime;
    uint256 public totalStaked;
    uint256 public totalDistributed;

    // Stakers info by token holders.
    mapping(address => Staker) public stakes;

    event Staked(uint256 amount, uint256 time, address indexed sender);
    event Claimed(uint256 amount, uint256 time, address indexed sender);
    event Unstaked(uint256 amount, uint256 time, address indexed sender);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        uint256 _startTime,
        uint256 _rewardTotal,
        uint256 _distributionTime,
        uint256 _stakePeriod,
        uint256 _claimPeriod,
        uint256 _minStake,
        uint256 _maxStake
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        startTime = _startTime;
        rewardTotal = _rewardTotal;
        distributionTime = _distributionTime;
        stakePeriod = _stakePeriod;
        claimPeriod = _claimPeriod;
        minStake = _minStake;
        maxStake = _maxStake;
        producedTime = _startTime;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @dev stake `amount` of tokens to the contract
     *
     * Parameters:
     *
     * - `_amount` - stake amount
     */
    function stake() external payable nonReentrant {
        require(
            block.timestamp > startTime,
            'WQStaking: Staking time has not come yet'
        );
        require(
            block.timestamp % 86400 >= 600 && block.timestamp % 86400 <= 85800,
            'WQStaking: Daily lock'
        );
        require(
            msg.value >= minStake,
            'WQStaking: Amount should be greater than minimum stake'
        );
        Staker storage staker = stakes[msg.sender];
        require(
            msg.value + staker.amount <= maxStake,
            'WQStaking: Amount should be less than maximum stake'
        );
        require(
            block.timestamp - staker.stakedAt > stakePeriod,
            'WQStaking: You cannot stake tokens yet'
        );
        if (totalStaked > 0) {
            update();
        }
        staker.rewardDebt += (msg.value * tokensPerStake) / 1e18;
        totalStaked += msg.value;
        staker.amount += msg.value;
        staker.stakedAt = block.timestamp;
        emit Staked(msg.value, block.timestamp, msg.sender);
    }

    /**
     * @dev unstake - return staked amount
     *
     * Parameters:
     *
     * - `_amount` - stake amount
     */

    function unstake(uint256 _amount) external nonReentrant {
        require(
            block.timestamp % 86400 >= 600 && block.timestamp % 86400 <= 85800,
            'WQStaking: Daily lock'
        );
        Staker storage staker = stakes[msg.sender];
        require(
            staker.amount >= _amount,
            'WQStaking: Not enough tokens to unstake'
        );

        update();

        staker.rewardAllowed += (_amount * tokensPerStake) / 1e18;
        staker.amount -= _amount;
        totalStaked -= _amount;

        payable(msg.sender).sendValue(_amount);

        emit Unstaked(_amount, block.timestamp, msg.sender);
    }

    /**
     * @dev claim available rewards
     */
    function claim() external nonReentrant {
        require(
            block.timestamp % 86400 >= 600 && block.timestamp % 86400 <= 85800,
            'WQStaking: Daily lock'
        );
        Staker storage staker = stakes[msg.sender];
        require(
            block.timestamp - staker.claimedAt > claimPeriod,
            'WQStaking: You cannot stake tokens yet'
        );

        if (totalStaked > 0) {
            update();
        }

        uint256 reward = calcReward(msg.sender, tokensPerStake);
        require(reward > 0, 'WQStaking: Nothing to claim');
        staker.distributed += reward;
        staker.claimedAt = block.timestamp;
        totalDistributed += reward;

        payable(msg.sender).sendValue(reward);

        emit Claimed(reward, block.timestamp, msg.sender);
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
            earlierProduced +
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
     * @dev getInfoByAddress - return information about the staker
     */
    function getInfoByAddress(address payable user)
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
        return (staked_, claim_, user.balance);
    }

    /**
     * @dev getStakingInfo - return information about the stake
     */
    function getStakingInfo() external view returns (StakeInfo memory info_) {
        info_ = StakeInfo({
            startTime: startTime,
            rewardTotal: rewardTotal,
            distributionTime: distributionTime,
            stakePeriod: stakePeriod,
            claimPeriod: claimPeriod,
            minStake: minStake,
            maxStake: maxStake,
            totalStaked: totalStaked,
            totalDistributed: totalDistributed
        });
        return info_;
    }

    function updateStartTime(uint256 _startTimeNew)
        external
        onlyRole(ADMIN_ROLE)
    {
        earlierProduced = produced();
        startTime = _startTimeNew;
        producedTime = _startTimeNew;
    }

    /**
     * @dev setReward - sets amount of reward during `distributionTime`
     */
    function updateRewardTotal(uint256 _amount) external onlyRole(ADMIN_ROLE) {
        earlierProduced = produced();
        producedTime = block.timestamp;
        rewardTotal = _amount;
    }

    function updateDistributionTime(uint256 _distributionTime)
        external
        onlyRole(ADMIN_ROLE)
    {
        earlierProduced = produced();
        producedTime = block.timestamp;
        distributionTime = _distributionTime;
    }

    /**
     * @dev Set staking period
     */
    function setStakePeriod(uint256 _stakePeriod)
        external
        onlyRole(ADMIN_ROLE)
    {
        stakePeriod = _stakePeriod;
    }

    /**
     * @dev Set claiming period
     */
    function setClaimPeriod(uint256 _claimPeriod)
        external
        onlyRole(ADMIN_ROLE)
    {
        claimPeriod = _claimPeriod;
    }

    /**
     * @dev Set minimum of users staked amount
     */
    function setMinStake(uint256 amount) external onlyRole(ADMIN_ROLE) {
        minStake = amount;
    }

    /**
     * @dev Set maximum of users total staked amount
     */
    function setMaxStake(uint256 amount) external onlyRole(ADMIN_ROLE) {
        maxStake = amount;
    }

    /**
     * @dev updateStakingInfo - synchronize the smart contracts
     */
    function updateStakingInfo(
        uint256 _tokensPerStake,
        uint256 _totalStaked,
        uint256 _totalDistributed
    ) external onlyRole(ADMIN_ROLE) {
        tokensPerStake = _tokensPerStake;
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
}
