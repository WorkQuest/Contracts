// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import './WQFundInterface.sol';

contract WQLending is
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

    struct DepositWallet {
        uint256 amount;
        uint256 borrowed;
        uint256 rewardAllowed;
        uint256 rewardDistributed;
        uint256 unlockDate;
        uint256 duration;
    }

    mapping(uint256 => uint256) public apys;
    IERC20Upgradeable public wusd;

    /// @notice Fee settings
    address public feeReceiver;
    uint256 public fee;

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
        uint256 _fee
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
        fee = _fee;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @notice Deposit native coins to contract
     */
    function deposit(uint256 lockTime, uint256 amount) external nonReentrant {
        DepositWallet storage wallet = wallets[msg.sender];
        if (wallet.unlockDate == 0) {
            wallet.unlockDate = block.timestamp + lockTime * 1 days;
            wallet.duration = lockTime;
        }
        wallet.amount += amount;
        wusd.safeTransferFrom(msg.sender, address(this), amount);
        emit Received(msg.sender, amount);
    }

    /**
     * @notice Withraw coins from contract
     * @param amount Amount of withrawal coins
     */
    function withdraw(uint256 amount) external nonReentrant {
        DepositWallet storage wallet = wallets[msg.sender];
        require(
            block.timestamp >= wallet.unlockDate,
            'WQSavingProduct: Lock time is not over yet'
        );
        require(amount <= wallet.amount, 'WQDeposit: Amount is invalid');
        wallet.amount -= amount;
        if (wallet.amount == 0) {
            wallet.unlockDate = 0;
        }
        uint256 comission = (amount * fee) / 1e18;
        wusd.safeTransfer(msg.sender, amount - comission);
        wusd.safeTransfer(feeReceiver, comission);
        emit Withdrew(msg.sender, amount);
    }

    /**
     * @notice Claim rewards
     */
    function claim() external nonReentrant {
        require(block.timestamp >= wallets[msg.sender].unlockDate);
        uint256 reward = getRewards(msg.sender);
        wallets[msg.sender].rewardDistributed += reward;
        wusd.safeTransfer(msg.sender, reward);
        emit Claimed(msg.sender, reward);
    }

    /**
     * @notice Get rewards amount of user
     * @param depositor Address of depositor
     */
    function getRewards(address depositor) public view returns (uint256) {
        DepositWallet storage wallet = wallets[depositor];
        return wallet.rewardAllowed - wallet.rewardDistributed;
    }

    /**
     * @notice Balance of funds on contract
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
            'WQLending: Insufficient amount in wallet'
        );
        wallets[depositor].borrowed += amount;
        wusd.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    /**
     * @notice Borrow funds to contract. Service function.
     * @param amount Amount of coins
     * @param elapsedTime Time elapsed since the beginning of the borrowing
     */
    function refund(
        address depositor,
        uint256 amount,
        uint256 elapsedTime,
        uint256 duration
    ) external override nonReentrant onlyRole(BORROWER_ROLE) {
        uint256 rewards = (amount * (apys[duration] * elapsedTime)) /
            YEAR /
            1e18;
        wallets[depositor].borrowed -= amount;
        wallets[depositor].rewardAllowed += rewards;
        wusd.safeTransferFrom(msg.sender, address(this), amount + rewards);
        emit Refunded(msg.sender, amount);
    }

    /**
     * @notice Set APY value
     * @param _apy APY value
     */
    function setApy(uint256 duration, uint256 _apy)
        external
        onlyRole(ADMIN_ROLE)
    {
        apys[duration] = _apy;
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
     * @param _fee Fee value
     */
    function setFee(uint256 _fee) external onlyRole(ADMIN_ROLE) {
        fee = _fee;
    }
}
