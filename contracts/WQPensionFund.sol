// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import './WQFundInterface.sol';

contract WQPensionFund is
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

    struct PensionWallet {
        uint256 amount;
        uint256 fee;
        uint256 unlockDate;
        uint256 createdAt;
        uint256 rewardAllowed;
        uint256 rewardDebt;
        uint256 rewardDistributed;
    }

    uint256 public lockTime;
    uint256 public defaultFee;
    uint256 public contributed;
    uint256 public rewardsPerContributed;
    uint256 public rewardsProduced;
    uint256 public rewardsDistributed;
    uint256 public borrowed;

    /// @notice Pension wallet info of worker
    mapping(address => PensionWallet) public wallets;

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

    /**
     * @notice initialize the contract
     */
    function initialize(uint256 _lockTime, uint256 _defaultFee)
        public
        initializer
    {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(BORROWER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);

        lockTime = _lockTime;
        defaultFee = _defaultFee;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @notice Contribute native moneys to contract on 3 years
     * @dev First contributing set variable createdAt to current timestamp,
     * @dev unlockDate to current_timestamp + 3*365 days
     * @dev and fee to DEFAULT_FEE value (1%)
     * @param worker Address of worker
     */
    function contribute(address worker) external payable nonReentrant {
        PensionWallet storage wallet = wallets[worker];
        if (wallet.createdAt == 0) {
            wallet.createdAt = block.timestamp;
            wallet.unlockDate = block.timestamp + lockTime;
            wallet.fee = defaultFee;
        }
        wallet.rewardDebt += (msg.value * rewardsPerContributed) / 1e20;
        wallet.amount += msg.value;
        contributed += msg.value;
        emit Received(worker, msg.value);
    }

    /**
     * @notice Withdraw funds from contract after 3 years
     * @param amount Amount of withdrawing funds
     */
    function withdraw(uint256 amount) external nonReentrant {
        PensionWallet storage wallet = wallets[msg.sender];
        require(
            block.timestamp >= wallet.unlockDate,
            'WQPensionFund: Lock time is not over yet'
        );
        require(amount <= wallet.amount, 'WQPensionFund: Amount is invalid');
        wallet.rewardAllowed += (amount * rewardsPerContributed) / 1e20;
        wallet.amount -= amount;
        contributed -= amount;
        payable(msg.sender).sendValue(amount);
        emit Withdrew(msg.sender, amount);
    }

    function claim() external nonReentrant {
        PensionWallet storage wallet = wallets[msg.sender];
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

    /**
     * @notice Update fee of job cost
     * @param fee Fee of job cost
     * @dev First calling set variable createdAt as current timestamp and
     * @dev unlockDate as current_timestamp + 3*365 days
     */
    function updateFee(uint256 fee) external {
        PensionWallet storage wallet = wallets[msg.sender];
        if (wallet.createdAt == 0) {
            wallet.createdAt = block.timestamp;
            wallet.unlockDate = block.timestamp + lockTime;
        }
        wallet.fee = fee;
    }

    function getFee(address user) external view returns (uint256) {
        return wallets[user].fee;
    }

    function updateDefaultFee(uint256 _defaultFee)
        external
        onlyRole(ADMIN_ROLE)
    {
        defaultFee = _defaultFee;
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
            'WQPension: Insuffience amount'
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
        borrowed -= (msg.value - rewards);
        rewardsProduced += rewards;
        rewardsPerContributed += (rewards * 1e20) / contributed;
        emit Refunded(msg.sender, msg.value);
    }
}
