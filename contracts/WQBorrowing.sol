// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import './WQPriceOracleInterface.sol';
import './WQFundInterface.sol';

contract WQBorrowing is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address payable;
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');
    uint256 public constant YEAR = 31536000;

    struct BorrowInfo {
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

    /// @notice Mapping of duration to APY coefficient
    mapping(uint256 => uint256) public apys;

    mapping(string => IERC20Upgradeable) public tokens;

    /// @notice Borrowing info
    mapping(address => BorrowInfo) public borrowers;

    /// @notice List of addresses of funds
    WQFundInterface[] public funds;

    event Borrowed(
        uint256 nonce,
        address user,
        uint256 collateral,
        uint256 credit,
        string symbol
    );

    event Refunded(uint256 nonce, address user, uint256 amount);

    event Received(uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(address _oracle, uint256 _fixedRate)
        external
        initializer
    {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        oracle = WQPriceOracleInterface(_oracle);
        fixedRate = _fixedRate;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    receive() external payable {
        emit Received(msg.value);
    }

    /**
     * @notice Borrow funds. It take collateral token and give native coin in rate 1000 WUSD / 1500 USD
     * @param collateralAmount Amount of collateral token
     * @param fundIndex Index of fund
     * @param duration Borrowing period
     * @param symbol Symbol of collateral token
     */
    function borrow(
        uint256 nonce,
        uint256 collateralAmount,
        uint256 fundIndex,
        uint256 duration,
        string calldata symbol
    ) external nonReentrant {
        require(
            tokens[symbol] != IERC20Upgradeable(address(0)),
            'WQBorrowing: This token is disabled to collateral'
        );
        require(apys[duration] > 0, 'WQBorrowing: Invalid duration');
        BorrowInfo storage loan = borrowers[msg.sender];
        require(
            loan.collateral == 0,
            'WQBorrowing: You are not refunded credit'
        );

        loan.collateral = collateralAmount;
        loan.borrowedAt = block.timestamp;
        loan.duration = duration;
        loan.apy = apys[duration];
        loan.fund = funds[fundIndex];
        loan.symbol = symbol;
        loan.credit =
            (collateralAmount * oracle.getTokenPriceUSD(symbol) * 2) /
            3e18;
        require(
            loan.credit <= loan.fund.balanceOf(),
            'WQBorrowing: Insufficient amount in fund'
        );

        // Take tokens
        tokens[symbol].safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );
        // Get coins from fund
        loan.fund.borrow(loan.credit);
        // Send native coins
        payable(msg.sender).sendValue(loan.credit);
        emit Borrowed(nonce, msg.sender, collateralAmount, loan.credit, symbol);
    }

    /**
     * @notice Refund loan
     * @param nonce Nonce value
     * @param returnAmount Return value of WUSD
     */
    function refund(uint256 nonce, uint256 returnAmount)
        external
        payable
        nonReentrant
    {
        BorrowInfo storage loan = borrowers[msg.sender];
        require(
            loan.collateral > 0,
            'WQBorrowing: You are not borrowed moneys'
        );
        uint256 tokenAmount = (loan.collateral * returnAmount) / loan.credit;
        _refund(msg.sender, msg.sender, returnAmount, tokenAmount);
        emit Refunded(nonce, msg.sender, returnAmount);
    }

    /**
     * @notice Buy collateral
     * @param nonce Nonce value
     * @param user Address of user
     * @param returnAmount Return value of WUSD
     */
    function buyCollateral(
        uint256 nonce,
        address user,
        uint256 returnAmount
    ) external payable nonReentrant {
        BorrowInfo storage loan = borrowers[user];
        require(
            loan.collateral > 0,
            'WQBorrowing: You are not borrowed moneys'
        );
        require(
            loan.borrowedAt > block.timestamp,
            'WQBorrowing: The collateral is not available for purchase'
        );
        uint256 currentPrice = oracle.getTokenPriceUSD(loan.symbol);
        require(
            (loan.credit * 3e36) / (2 * loan.collateral * currentPrice) > 1e18,
            'WQBorrowing: The collateral price is insufficient to repay the credit'
        );
        _refund(
            user,
            msg.sender,
            returnAmount,
            (returnAmount * 1e18) / currentPrice
        );
        emit Refunded(nonce, msg.sender, returnAmount);
    }

    /**
     * @notice Refund loan
     */
    function _refund(
        address user,
        address buyer,
        uint256 debtAmount,
        uint256 returnCollateral
    ) internal {
        BorrowInfo storage loan = borrowers[user];
        require(
            tokens[loan.symbol] != IERC20Upgradeable(address(0)),
            'WQBorrowing: Token is disabled'
        );
        uint256 fee = (debtAmount *
            (fixedRate +
                ((loan.apy * (block.timestamp - loan.borrowedAt)) / YEAR))) /
            1e18;

        // Take native coins
        require(
            msg.value >= debtAmount + fee,
            'WQBorrowing: Refund insufficient amount'
        );
        loan.credit -= debtAmount;
        loan.collateral -= returnCollateral;
        // and send back to fund
        uint256 rewards = (debtAmount *
            ((loan.fund.apys(loan.duration) *
                (block.timestamp - loan.borrowedAt)) / YEAR)) / 1e18;

        loan.fund.refund{value: debtAmount + rewards}(
            debtAmount,
            block.timestamp - loan.borrowedAt,
            loan.duration
        );
        //Send tokens
        tokens[loan.symbol].safeTransfer(buyer, returnCollateral);
        // Return change
        if (msg.value > debtAmount + fee) {
            payable(buyer).sendValue(msg.value - debtAmount - fee);
        }
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
}
