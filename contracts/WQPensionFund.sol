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
    uint256 public constant MONTH = 2592000;

    struct PensionWallet {
        uint256 amount;
        uint256 borrowed;
        uint256 fee;
        uint256 unlockDate;
        uint256 createdAt;
        uint256 rewardAllowed;
        uint256 rewardDistributed;
        uint256 serviceComission;
    }

    uint256 public lockTime;
    uint256 public defaultFee;

    mapping(uint256 => uint256) public apys;
    IERC20Upgradeable public wusd;

    /// @notice Fee settings
    address public feeReceiver;
    uint256 public feePerMonth;
    uint256 public feeWithdraw;

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
        address _wusd,
        address _feeReceiver,
        uint256 _feePerMonth,
        uint256 _feeWithdraw
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
        wusd = IERC20Upgradeable(_wusd);
        feeReceiver = _feeReceiver;
        feePerMonth = _feePerMonth;
        feeWithdraw = _feeWithdraw;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @notice Contribute native moneys to contract on 3 years
     * @dev First contributing set variable createdAt to current timestamp,
     * @dev unlockDate to current_timestamp + lockTime
     * @dev and fee to DEFAULT_FEE value (1%)
     * @param worker Address of worker
     */
    function contribute(address worker, uint256 amount) external nonReentrant {
        PensionWallet storage wallet = wallets[worker];
        if (wallet.createdAt == 0) {
            wallet.createdAt = block.timestamp;
            wallet.unlockDate = block.timestamp + lockTime;
            wallet.fee = defaultFee;
            wallet.serviceComission = 0;
            emit WalletUpdated(worker, wallet.fee, wallet.unlockDate);
        }
        wallet.amount += amount;
        wallet.serviceComission += (amount * feePerMonth * (wallet.unlockDate - block.timestamp)) / MONTH / 1e18;
        wusd.safeTransferFrom(msg.sender, address(this), amount);
        emit Received(worker, amount, block.timestamp);
    }

    /**
     * @notice Withdraw funds from contract after 3 years
     * @param amount Amount of withdrawing funds
     */
    function withdraw(uint256 amount) external nonReentrant {
        PensionWallet storage wallet = wallets[msg.sender];
        require(block.timestamp >= wallet.unlockDate, 'WQPension: Lock time is not over yet');
        require(amount <= wallet.amount, 'WQPension: Amount is invalid');
        uint256 reward = (amount * getRewards(msg.sender)) / wallet.amount;
        wallet.rewardDistributed += reward;
        uint256 closeComission = (amount * feeWithdraw) / 1e18;
        uint256 serviceComission = (amount * wallet.serviceComission) /
            wallet.amount;
        wallet.amount -= amount;
        if (wallet.amount == 0) {
            wallet.unlockDate = 0;
        }
        wallet.serviceComission -= serviceComission;
        wusd.safeTransfer(
            msg.sender,
            amount + reward - closeComission - serviceComission
        );
        wusd.safeTransfer(feeReceiver, closeComission + serviceComission);
        emit Withdrew(msg.sender, amount, block.timestamp);
        emit Claimed(msg.sender, reward, block.timestamp);
    }

    function getRewards(address depositor) public view returns (uint256) {
        PensionWallet storage wallet = wallets[depositor];
        return wallet.rewardAllowed - wallet.rewardDistributed;
    }

    /**
     * @notice Update fee of job cost
     * @param fee Fee of job cost
     * @dev First calling set variable createdAt as current timestamp and
     * @dev unlockDate as current_timestamp + 3*365 days
     */
    function updateFee(uint256 fee) external {
        require(fee <= 1e18, 'WQPensionFund: invalid fee value');
        PensionWallet storage wallet = wallets[msg.sender];
        if (wallet.createdAt == 0) {
            wallet.createdAt = block.timestamp;
            wallet.unlockDate = block.timestamp + lockTime;
        }

        require(fee <= 1e18, 'WQPension: Invalid fee value');
        wallet.fee = fee;
        emit WalletUpdated(msg.sender, wallet.fee, wallet.unlockDate);
    }

    function extendLockTime() external {
        PensionWallet storage wallet = wallets[msg.sender];
        require(block.timestamp >= wallet.unlockDate, 'WQPension: Lock time is not over yet');
        wallet.unlockDate = block.timestamp + YEAR;
    }

    function getFee(address depositor) external view returns (uint256) {
        return wallets[depositor].fee;
    }

    /** Borrowing interface */

    /**
     * @notice Balance of depositor
     * @param depositor Address of depositor
     */
    function balanceOf(address depositor)
        public
        view
        override
        returns (uint256)
    {
        return wallets[depositor].amount - wallets[depositor].borrowed;
    }

    /**
     * @notice Borrow funds from contract. Service function.
     * @param depositor Address of depositor
     * @param amount Amount of coins
     * @param duration Duration of lock time
     */
    function borrow(
        address depositor,
        uint256 amount,
        uint256 duration
    ) external override nonReentrant onlyRole(BORROWER_ROLE) returns (uint256) {
        require(block.timestamp < wallets[depositor].unlockDate, 'WQPension: Credit unavailable');
        wallets[depositor].borrowed += amount;
        wusd.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount, block.timestamp);
        uint256 borrowedTo = block.timestamp + duration * 1 days;
        return borrowedTo < wallets[depositor].unlockDate ? borrowedTo : wallets[depositor].unlockDate;
    }

    /**
     * @notice Repay funds to contract. Service function.
     * @param depositor Address of depositor
     * @param amount Amount of coins
     * @param elapsedTime Time elapsed since the beginning of the borrowing
     * @param duration Duration of lock time
     */
    function refund(
        address depositor,
        uint256 amount,
        uint256 elapsedTime,
        uint256 duration
    ) external override nonReentrant onlyRole(BORROWER_ROLE) {
        uint256 rewards = (amount * (apys[duration] * elapsedTime)) / YEAR / 1e18;
        wallets[depositor].borrowed -= amount;
        wallets[depositor].rewardAllowed += rewards;
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
     * @param apy APY value
     */
    function setApy(uint256 duration, uint256 apy)
        external
        onlyRole(ADMIN_ROLE)
    {
        apys[duration] = apy;
    }

    function updateWallet(
        address depositor,
        uint256 amount,
        uint256 unlockDate,
        uint256 createdAt //,
    )
        external
        // uint256 serviceComission
        onlyRole(ADMIN_ROLE)
    {
        wallets[depositor].amount = amount;
        wallets[depositor].unlockDate = unlockDate;
        wallets[depositor].createdAt = createdAt;
        // wallets[depositor].serviceComission = serviceComission;
    }

    /**
     * @notice Set fee receiver address
     * @param _feeReceiver Fee receiver address
     */
    function setFeeReceiver(address _feeReceiver)
        external
        onlyRole(ADMIN_ROLE)
    {
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Set fee receiver address
     * @param _feeWithdraw Fee value for withdraw value
     * @param _feePerMonth Fee per month value
     */
    function setFee(uint256 _feeWithdraw, uint256 _feePerMonth)
        external
        onlyRole(ADMIN_ROLE)
    {
        feeWithdraw = _feeWithdraw;
        feePerMonth = _feePerMonth;
    }
}
