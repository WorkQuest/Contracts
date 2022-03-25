// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import './WQFundInterface.sol';

contract WQSavingProduct is
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
    uint256 public constant YEAR = 31536000;

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

    /// @notice Mapping lock time to APY values
    mapping(uint256 => uint256) public override apys;

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
        require(apys[lockTime] != 0, 'WQSavingProduct: lockTime is invalid');
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
            'WQSavingProduct: Lock time is not over yet'
        );
        require(amount <= wallet.amount, 'WQSavingProduct: Amount is invalid');
        wallet.rewardAllowed += (amount * rewardsPerContributed) / 1e20;
        wallet.amount -= amount;
        contributed -= amount;
        payable(msg.sender).sendValue(amount);
        emit Withdrew(msg.sender, amount);
    }

    function claim() external nonReentrant {
        require(block.timestamp >= wallets[msg.sender].unlockDate);
        uint256 reward = getRewards(msg.sender);
        wallets[msg.sender].rewardDistributed += reward;
        rewardsDistributed += reward;
        payable(msg.sender).sendValue(reward);
        emit Claimed(msg.sender, reward);
    }

    function getRewards(address user) public view returns (uint256) {
        DepositWallet storage wallet = wallets[user];
        return
            ((wallet.amount * rewardsPerContributed) / 1e20) +
            wallet.rewardAllowed -
            wallet.rewardDistributed -
            wallet.rewardDebt;
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
            'WQSavingProduct: Insufficient amount'
        );
        borrowed += amount;
        payable(msg.sender).sendValue(amount);
        emit Borrowed(msg.sender, amount);
    }

    function refund(
        uint256 amount,
        uint256 elapsedTime,
        uint256 duration
    ) external payable override nonReentrant onlyRole(BORROWER_ROLE) {
        require(apys[duration] > 0, 'WQSavingProduct: invalid duration');
        uint256 rewards = msg.value - amount;
        require(
            (rewards * 1e18) / amount >= (apys[duration] * elapsedTime) / YEAR,
            'WQSavingProduct: Insufficient rewards'
        );
        borrowed -= amount;
        rewardsProduced += rewards;
        rewardsPerContributed += (rewards * 1e20) / contributed;
        emit Refunded(msg.sender, amount);
    }

    function setApy(uint256 duration, uint256 apy)
        external
        onlyRole(ADMIN_ROLE)
    {
        apys[duration] = apy;
    }
}
