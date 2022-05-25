// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import './WQPriceOracleInterface.sol';
import './WQFundInterface.sol';

contract WQBorrowing is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');
    bytes32 public constant AUCTION_ROLE = keccak256('AUCTION_ROLE');
    uint256 public constant YEAR = 31536000;

    struct BorrowInfo {
        address depositor;
        uint256 collateral;
        uint256 credit;
        uint256 borrowedAt;
        uint256 duration;
        uint256 apy;
        WQFundInterface fund;
        string symbol;
    }

    WQPriceOracleInterface public oracle;
    uint256 public fixedRate;
    IERC20Upgradeable public wusd;

    /// @notice Fee settings
    address public feeReceiver;
    uint256 public fee;

    /// @notice Mapping of duration to APY coefficient
    mapping(uint256 => uint256) public apys;

    mapping(string => IERC20Upgradeable) public tokens;

    /// @notice Borrowing info
    mapping(address => BorrowInfo[]) public borrowers;

    /// @notice List of addresses of funds
    WQFundInterface[] public funds;

    event Borrowed(
        uint256 nonce,
        address borrower,
        uint256 index,
        uint256 collateral,
        uint256 credit,
        string symbol
    );

    event Refunded(
        uint256 nonce,
        address borrower,
        uint256 index,
        uint256 amount
    );

    event Received(uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        uint256 _fixedRate,
        uint256 _fee,
        address _oracle,
        address _wusd,
        address _feeReceiver
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(AUCTION_ROLE, ADMIN_ROLE);
        oracle = WQPriceOracleInterface(_oracle);
        fixedRate = _fixedRate;
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
     * @notice Borrow funds. It take collateral token and give native coin in rate 1000 WUSD / 1500 USD
     * @param nonce Number for claim events
     * @param depositor Address of depositor's wallet
     * @param credit Amount of credit
     * @param fundIndex Index of fund
     * @param duration Borrowing period
     * @param symbol Symbol of collateral token
     */
    function borrow(
        uint256 nonce,
        address depositor,
        uint256 credit,
        uint256 fundIndex,
        uint256 duration,
        string calldata symbol
    ) external nonReentrant {
        require(
            tokens[symbol] != IERC20Upgradeable(address(0)),
            'WQBorrowing: This token is disabled to collateral'
        );
        require(apys[duration] > 0, 'WQBorrowing: Invalid duration');
        require(
            funds[fundIndex].apys(duration) > 0,
            'WQBorrowing: Invalid duration'
        );
        require(
            credit <= funds[fundIndex].balanceOf(depositor),
            'WQBorrowing: Insufficient amount in fund'
        );
        uint256 collateralAmount = (credit * 3e18) /
            oracle.getTokenPriceUSD(symbol) /
            2 /
            (10 **
                (18 -
                    IERC20MetadataUpgradeable(address(tokens[symbol]))
                        .decimals()));
        borrowers[msg.sender].push(
            BorrowInfo({
                depositor: depositor,
                collateral: collateralAmount,
                borrowedAt: block.timestamp,
                duration: duration,
                apy: apys[duration],
                fund: funds[fundIndex],
                symbol: symbol,
                credit: credit
            })
        );

        // Take collateral tokens
        tokens[symbol].safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );
        // Get coins from fund
        funds[fundIndex].borrow(depositor, credit, duration);
        // Send wusd credit
        wusd.safeTransfer(msg.sender, credit);

        emit Borrowed(
            nonce,
            msg.sender,
            borrowers[msg.sender].length - 1,
            collateralAmount,
            credit,
            symbol
        );
    }

    /**
     * @notice Refund loan
     * @param nonce Nonce value
     * @param amount Return amount of WUSD
     */
    function refund(
        uint256 index,
        uint256 nonce,
        uint256 amount
    ) external nonReentrant {
        BorrowInfo storage loan = borrowers[msg.sender][index];
        require(loan.credit > 0, 'WQBorrowing: You are not borrowed moneys');
        _refund(
            index,
            msg.sender,
            msg.sender,
            amount,
            (loan.collateral * amount) / loan.credit
        );
        wusd.safeTransferFrom(msg.sender, feeReceiver, (amount * fee) / 1e18);
        emit Refunded(nonce, msg.sender, index, amount);
    }

    function startAuction(uint256 index, address borrower)
        external
        nonReentrant
    {
        BorrowInfo storage loan = borrowers[borrower][index];
        require(
            block.timestamp > loan.borrowedAt + loan.duration * 1 days,
            'WQBorrowing: The collateral is not available for purchase'
        );
    }

    /**
     * @notice Buy collateral
     * @param nonce Nonce value
     * @param borrower Address of borrower
     * @param amount Return amount of WUSD
     */
    function buyCollateral(
        uint256 index,
        uint256 nonce,
        address borrower,
        uint256 amount
    ) external nonReentrant onlyRole(AUCTION_ROLE) {
        BorrowInfo storage loan = borrowers[borrower][index];
        require(
            loan.collateral > 0,
            'WQBorrowing: You are not borrowed moneys'
        );
        require(
            block.timestamp > loan.borrowedAt + loan.duration * 1 days,
            'WQBorrowing: The collateral is not available for purchase'
        );
        uint256 currentPrice = oracle.getTokenPriceUSD(loan.symbol);
        uint256 factor = 10 **
            (18 -
                IERC20MetadataUpgradeable(address(tokens[loan.symbol]))
                    .decimals());
        require(
            (loan.credit * factor * 3e36) /
                (2 * loan.collateral * currentPrice) >
                1e18,
            'WQBorrowing: The collateral price is insufficient to repay the credit'
        );
        _refund(
            index,
            borrower,
            msg.sender,
            amount,
            (amount * 1e18) / currentPrice / factor
        );
        emit Refunded(nonce, msg.sender, index, amount);
    }

    /**
     * @notice Refund loan
     */
    function _refund(
        uint256 index,
        address borrower,
        address buyer,
        uint256 debtAmount,
        uint256 returnCollateral
    ) internal {
        BorrowInfo storage loan = borrowers[borrower][index];
        require(
            tokens[loan.symbol] != IERC20Upgradeable(address(0)),
            'WQBorrowing: Token is disabled'
        );
        loan.credit -= debtAmount;
        loan.collateral -= returnCollateral;
        uint256 rewards = _getRewards(
            debtAmount,
            loan.fund.apys(loan.duration),
            loan.borrowedAt
        );
        uint256 comission = _getCurrentFee(
            debtAmount,
            loan.apy,
            loan.borrowedAt
        );
        // Take wusd

        wusd.safeTransferFrom(
            msg.sender,
            address(this),
            debtAmount + comission
        );
        if (wusd.allowance(address(this), address(loan.fund)) > 0) {
            wusd.safeApprove(address(loan.fund), 0);
        }
        wusd.safeApprove(address(loan.fund), debtAmount + rewards);
        loan.fund.refund(
            loan.depositor,
            debtAmount,
            block.timestamp - loan.borrowedAt,
            loan.duration
        );
        wusd.safeTransfer(feeReceiver, comission - rewards);
        //Send tokens
        tokens[loan.symbol].safeTransfer(buyer, returnCollateral);
    }

    function getCurrentFee(address borrower, uint256 index)
        external
        view
        returns (uint256)
    {
        BorrowInfo storage loan = borrowers[borrower][index];
        return _getCurrentFee(loan.credit, loan.apy, loan.borrowedAt);
    }

    function getRewards(address borrower, uint256 index)
        external
        view
        returns (uint256)
    {
        BorrowInfo storage loan = borrowers[borrower][index];
        return
            _getRewards(
                loan.credit,
                loan.fund.apys(loan.duration),
                loan.borrowedAt
            );
    }

    function _getCurrentFee(
        uint256 amount,
        uint256 apy,
        uint256 borrowedAt
    ) internal view returns (uint256) {
        return
            (amount *
                fixedRate +
                (amount * apy * (block.timestamp - borrowedAt)) /
                YEAR) / 1e18;
    }

    function _getRewards(
        uint256 amount,
        uint256 apy,
        uint256 borrowedAt
    ) internal view returns (uint256) {
        return (amount * apy * (block.timestamp - borrowedAt)) / YEAR / 1e18;
    }

    function getFunds()
        external
        view
        returns (WQFundInterface[] memory funds_)
    {
        funds_ = new WQFundInterface[](funds.length);
        for (uint256 i = 0; i < funds.length; i++) {
            funds_[i] = funds[i];
        }
        return funds_;
    }

    /**
     * @notice Add address of fund
     * @param fund Address of fund
     */
    function addFund(WQFundInterface fund) external onlyRole(ADMIN_ROLE) {
        funds.push(fund);
    }

    /**
     * @notice Update address of fund
     * @param index index of funds
     * @param fund Address of fund
     */
    function updateFund(uint256 index, WQFundInterface fund)
        external
        onlyRole(ADMIN_ROLE)
    {
        funds[index] = fund;
    }

    /**
     * @notice Remove address from funds
     * @param index index of fund
     */
    function removeFund(uint256 index) external onlyRole(ADMIN_ROLE) {
        funds[index] = funds[funds.length - 1];
        funds.pop();
    }

    function setApy(uint256 duration, uint256 apy)
        external
        onlyRole(ADMIN_ROLE)
    {
        apys[duration] = apy;
    }

    function setFixedRate(uint256 _fixedRate) external onlyRole(ADMIN_ROLE) {
        fixedRate = _fixedRate;
    }

    function setToken(IERC20Upgradeable token, string calldata symbol)
        external
        onlyRole(ADMIN_ROLE)
    {
        tokens[symbol] = token;
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
