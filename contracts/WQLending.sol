// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import './WQFundInterface.sol';

contract WQDeposit is
    WQFundInterface,
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using AddressUpgradeable for address payable;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant BORROWER_ROLE = keccak256('BORROWER_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    struct DepositWallet {
        uint256 amount;
        uint256 rewardAllowed;
        uint256 rewardDebt;
        uint256 rewardDistributed;
        uint256 unlockDate;
    }

    uint256 public contributed;
    uint256 public rewardsPerContributed;
    uint256 public rewardsProduced;
    uint256 public rewardsDistributed;
    uint256 public borrowed;
    uint256 apy;

    /// @notice Lock time valid values in days
    uint256[] public lockTimes;

    /// @notice Deposit wallet info of user
    mapping(address => DepositWallet) public wallets;

    /// @notice Event emitted when funds transferred to contract
    event Received(address user, uint256 amount);

    /// @notice Event emitted when funds withrew from contract
    event Withdrew(address user, uint256 amount);

    /// @notice Event emitted when rewards claimed
    event Claimed(address user, uint256 amount);

    /// @notice Event emitted when funds borrowed
    event Borrowed(address user, uint256 amount);

    /// @notice Event emitted when funds returned
    event Refunded(address user, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize() external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
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
     * @notice Contribute native coins to contract
     */
    function deposit(uint256 lockTime) external payable nonReentrant {
        bool checked;
        for (uint256 i = 0; i < lockTimes.length; i++) {
            if (lockTime == lockTimes[i]) {
                checked = true;
                break;
            }
        }
        require(checked, 'WQDeposit: lockTime is invalid');
        DepositWallet storage wallet = wallets[msg.sender];
        if (wallet.unlockDate == 0) {
            wallet.unlockDate = block.timestamp + lockTime * 1 days;
        }
        wallet.rewardDebt += (msg.value * rewardsPerContributed) / 1e20;
        wallet.amount += msg.value;
        contributed += msg.value;
        emit Received(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external nonReentrant {
        DepositWallet storage wallet = wallets[msg.sender];
        require(
            block.timestamp >= wallet.unlockDate,
            'WQDeposit: Lock time is not over yet'
        );
        require(amount <= wallet.amount, 'WQDeposit: Amount is invalid');
        wallet.rewardAllowed += (amount * rewardsPerContributed) / 1e20;
        wallet.amount -= amount;
        contributed -= amount;
        payable(msg.sender).sendValue(amount);
        emit Withdrew(msg.sender, amount);
    }

    function claim() external nonReentrant {
        DepositWallet storage wallet = wallets[msg.sender];
        require(block.timestamp >= wallet.unlockDate);
        uint256 reward = ((wallet.amount * rewardsPerContributed) / 1e20) +
            wallet.rewardAllowed -
            wallet.rewardDistributed -
            wallet.rewardDebt;
        wallet.rewardDistributed += reward;
        rewardsDistributed += reward;
        payable(msg.sender).sendValue(reward);
        emit Claimed(msg.sender, reward);
    }

    function balanceOf() external view override returns (uint256) {
        return contributed - borrowed;
    }

    function borrow(uint256 amount)
        external
        override
        nonReentrant
        onlyRole(BORROWER_ROLE)
    {
        require(
            amount <= contributed - borrowed,
            'WQPension: Insufficient amount'
        );
        borrowed += amount;
        payable(msg.sender).sendValue(amount);
        emit Borrowed(msg.sender, amount);
    }

    function refund(uint256 rewards)
        external
        payable
        override
        nonReentrant
        onlyRole(BORROWER_ROLE)
    {
        require((rewards * 1e18) / msg.value >= apy, 'WQLending: Insufficient rewards');
        borrowed -= (msg.value - rewards);
        rewardsProduced += rewards;
        rewardsPerContributed += (rewards * 1e20) / contributed;
        emit Refunded(msg.sender, msg.value);
    }

    /**
     * @notice Add value to lockTimes
     * @param lockTime Value in days
     */
    function addLockTime(uint256 lockTime) external onlyRole(ADMIN_ROLE) {
        lockTimes.push(lockTime);
    }

    /**
     * @notice Update value in lockTimes
     * @param index index of lockTimes
     * @param lockTime Value in days
     */
    function updateLockTime(uint256 index, uint256 lockTime)
        external
        onlyRole(ADMIN_ROLE)
    {
        lockTimes[index] = lockTime;
    }

    /**
     * @notice Remove value from lockTimes
     * @param index index of lockTimes
     */
    function removeLockTime(uint256 index) external onlyRole(ADMIN_ROLE) {
        lockTimes[index] = lockTimes[lockTimes.length - 1];
        lockTimes.pop();
    }
}
