// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import './WQFundInterface.sol';

contract WQPensionFund is
    WQFundInterface,
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant BORROWER_ROLE = keccak256('BORROWER_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');
    uint256 public constant YEAR = 31536000;

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
    uint256 internal apy;
    IERC20Upgradeable public wusd;

    /// @notice Pension wallet info of worker
    mapping(address => PensionWallet) public wallets;

    /// @notice Event emitted when funds transferred to contract
    event Received(
        address indexed user,
        uint256 indexed amount,
        uint256 timestamp
    );

    /// @notice Event emitted when funds withrew from contract
    event Withdrew(
        address indexed user,
        uint256 indexed amount,
        uint256 timestamp
    );

    /// @notice Event emitted when rewards claimed
    event Claimed(
        address indexed user,
        uint256 indexed amount,
        uint256 timestamp
    );

    /// @notice Event emitted when funds borrowed
    event Borrowed(
        address indexed user,
        uint256 indexed amount,
        uint256 timestamp
    );

    /// @notice Event emitted when funds returned
    event Refunded(
        address indexed user,
        uint256 indexed amount,
        uint256 timestamp
    );

    event WalletUpdated(
        address indexed user,
        uint256 indexed newFee,
        uint256 unlockDate
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice initialize the contract
     */
    function initialize(
        uint256 _lockTime,
        uint256 _defaultFee,
        uint256 _apy,
        address _wusd
    ) public initializer {
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
        apy = _apy;
        wusd = IERC20Upgradeable(_wusd);
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
    function contribute(address worker, uint256 amount) external nonReentrant {
        PensionWallet storage wallet = wallets[worker];
        if (wallet.createdAt == 0) {
            wallet.createdAt = block.timestamp;
            wallet.unlockDate = block.timestamp + lockTime;
            wallet.fee = defaultFee;
            emit WalletUpdated(worker, wallet.fee, wallet.unlockDate);
        }
        wallet.rewardDebt += (amount * rewardsPerContributed) / 1e20;
        wallet.amount += amount;
        contributed += amount;
        wusd.safeTransferFrom(msg.sender, address(this), amount);
        emit Received(worker, amount, block.timestamp);
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
        uint256 reward = getRewards(msg.sender);
        wallet.rewardDistributed += reward;
        rewardsDistributed += reward;

        wallet.rewardAllowed += (amount * rewardsPerContributed) / 1e20;
        wallet.amount -= amount;
        contributed -= amount;
        wusd.safeTransfer(msg.sender, amount + reward);
        emit Withdrew(msg.sender, amount, block.timestamp);
        emit Claimed(msg.sender, reward, block.timestamp);
    }

    function getRewards(address user) public view returns (uint256) {
        PensionWallet storage wallet = wallets[user];
        return
            ((wallet.amount * rewardsPerContributed) / 1e20) +
            wallet.rewardAllowed -
            wallet.rewardDistributed -
            wallet.rewardDebt;
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
        emit WalletUpdated(msg.sender, wallet.fee, wallet.unlockDate);
    }

    function extendLockTime() external {
        PensionWallet storage wallet = wallets[msg.sender];
        require(
            block.timestamp >= wallet.unlockDate,
            'WQPensionFund: Lock time is not over yet'
        );
        wallet.unlockDate = block.timestamp + YEAR;
    }

    function getFee(address user) external view returns (uint256) {
        return wallets[user].fee;
    }

    /** Borrowing interface */

    function balanceOf() external view override returns (uint256) {
        return contributed - borrowed;
    }

    function apys(uint256) external view override returns (uint256) {
        return apy;
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
        wusd.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount, block.timestamp);
    }

    function refund(
        uint256 amount,
        uint256 elapsedTime,
        uint256
    ) external override nonReentrant onlyRole(BORROWER_ROLE) {
        uint256 rewards = (amount * (apy * elapsedTime)) / YEAR / 1e18;
        borrowed -= amount;
        rewardsProduced += rewards;
        rewardsPerContributed += (rewards * 1e20) / contributed;
        wusd.safeTransferFrom(msg.sender, address(this), amount + rewards);
        emit Refunded(msg.sender, amount, block.timestamp);
    }

    /** Admin functions */
    function updateDefaultFee(uint256 _defaultFee)
        external
        onlyRole(ADMIN_ROLE)
    {
        defaultFee = _defaultFee;
    }

    function updateLockTime(uint256 _lockTime) external onlyRole(ADMIN_ROLE) {
        lockTime = _lockTime;
    }

    /**
     * @notice Set APY value
     * @param _apy APY value
     */
    function setApy(uint256 _apy) external onlyRole(ADMIN_ROLE) {
        apy = _apy;
    }

    function updateWallet(
        address user,
        uint256 amount,
        uint256 unlockDate,
        uint256 createdAt
    ) external onlyRole(ADMIN_ROLE) {
        wallets[user].amount = amount;
        wallets[user].unlockDate = unlockDate;
        wallets[user].createdAt = createdAt;
    }
}
