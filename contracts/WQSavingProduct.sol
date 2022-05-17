// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import './WQFundInterface.sol';

contract WQSavingProduct is
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

    struct DepositWallet {
        uint256 amount;
        uint256 borrowed;
        uint256 rewardAllowed;
        uint256 rewardDebt;
        uint256 rewardDistributed;
        uint256 unlockDate;
        uint256 duration;
        uint256 serviceComission;
    }

    uint256 public contributed;
    uint256 public rewardsPerContributed;
    uint256 public rewardsProduced;
    uint256 public rewardsDistributed;
    uint256 public borrowed;
    IERC20Upgradeable public wusd;

    /// @notice Fee settings
    address public feeReceiver;
    uint256 public feePerMonth;
    uint256 public feeWithdraw;

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

    function initialize(
        address _wusd,
        address _feeReceiver,
        uint256 _feePerMonth,
        uint256 _feeWithdraw
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
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
     * @notice Contribute native coins to contract
     * @param lockTime Lock time in days
     */
    function deposit(uint256 lockTime, uint256 amount) external nonReentrant {
        require(apys[lockTime] != 0, 'WQSavingProduct: lockTime is invalid');
        DepositWallet storage wallet = wallets[msg.sender];
        if (wallet.unlockDate == 0) {
            wallet.unlockDate = block.timestamp + lockTime * 1 days;
            wallet.duration = lockTime;
            wallet.serviceComission = 0;
        }
        wallet.rewardDebt += (amount * rewardsPerContributed) / 1e20;
        wallet.amount += amount;
        contributed += amount;
        wallet.serviceComission +=
            (amount * feePerMonth * (wallet.unlockDate - block.timestamp)) /
            MONTH /
            1e18;
        wusd.safeTransferFrom(msg.sender, address(this), amount);
        emit Received(msg.sender, amount);
    }

    /**
     * @notice Withdraw funds from contract after lockTime days
     * @param amount Amount of withdrawing funds
     */
    function withdraw(uint256 amount) external nonReentrant {
        DepositWallet storage wallet = wallets[msg.sender];
        require(
            block.timestamp >= wallet.unlockDate,
            'WQSavingProduct: Lock time is not over yet'
        );
        require(amount <= wallet.amount, 'WQSavingProduct: Amount is invalid');
        wallet.rewardAllowed += (amount * rewardsPerContributed) / 1e20;
        wallet.amount -= amount;
        if (wallet.amount == 0) {
            wallet.unlockDate = 0;
        }
        contributed -= amount;
        uint256 closeComission = (amount * feeWithdraw) / 1e18;
        uint256 serviceComission = (amount * wallet.serviceComission) /
            wallet.amount;
        wallet.serviceComission -= serviceComission;
        wusd.safeTransfer(
            msg.sender,
            amount - closeComission - serviceComission
        );
        wusd.safeTransfer(feeReceiver, closeComission + serviceComission);
        emit Withdrew(msg.sender, amount);
    }

    /**
     * @notice Claim rewards
     */
    function claim() external nonReentrant {
        require(block.timestamp >= wallets[msg.sender].unlockDate);
        uint256 reward = getRewards(msg.sender);
        wallets[msg.sender].rewardDistributed += reward;
        rewardsDistributed += reward;
        wusd.safeTransfer(msg.sender, reward);
        emit Claimed(msg.sender, reward);
    }

    /**
     * @notice Get rewards amount of user
     * @param depositor Address of user
     */
    function getRewards(address depositor) public view returns (uint256) {
        DepositWallet storage wallet = wallets[depositor];
        return
            ((wallet.amount * rewardsPerContributed) / 1e20) +
            wallet.rewardAllowed -
            wallet.rewardDistributed -
            wallet.rewardDebt;
    }

    /**
     * @notice Balance of funds on contract
     */
    function balanceOf(address depositor) public view override returns (uint256) {
        return wallets[depositor].amount - wallets[depositor].borrowed;
    }

    /**
     * @notice Borrow funds from contract. Service function.
     * @param amount Amount of coins
     */
    function borrow(address depositor, uint256 amount)
        external
        override
        nonReentrant
        onlyRole(BORROWER_ROLE)
    {
        require(
            amount <= balanceOf(depositor),
            'WQSavingProduct: Insufficient amount in wallet'
        );
        wallets[depositor].borrowed += amount;
        borrowed += amount;
        wusd.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    /**
     * @notice Borrow funds to contract. Service function.
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
        require(apys[duration] > 0, 'WQSavingProduct: invalid duration');
        uint256 rewards = (amount * (apys[duration] * elapsedTime)) /
            YEAR /
            1e18;
        wallets[depositor].borrowed -= amount;
        borrowed -= amount;
        rewardsProduced += rewards;
        rewardsPerContributed += (rewards * 1e20) / contributed;
        wusd.safeTransferFrom(msg.sender, address(this), amount + rewards);
        emit Refunded(msg.sender, amount);
    }

    /**
     * @notice Set APY value
     * @param duration Duration of lock time
     * @param apy APY value
     */
    function setApy(uint256 duration, uint256 apy)
        external
        onlyRole(ADMIN_ROLE)
    {
        apys[duration] = apy;
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
