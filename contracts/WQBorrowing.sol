// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import './WQPriceOracle.sol';
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
        uint256 price;
        uint256 credit;
        uint256 borrowedAt;
        uint256 apy;
        bool borrowed;
        IERC20Upgradeable token;
        WQFundInterface fund;
    }

    uint256 apy;

    WQPriceOracle oracle;

    WQFundInterface[] public funds;

    mapping(IERC20Upgradeable => bool) public enabledTokens;

    mapping(address => BorrowInfo) public borrowers;

    event Borrowed(
        uint256 collateral,
        IERC20Upgradeable token,
        uint256 price,
        uint256 loan,
        address borrower
    );
    event Refunded(address to, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(address _oracle) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        oracle = WQPriceOracle(_oracle);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @notice Borrow funds. It take collateral token and give native coin in rate 1000 WUSD / 1500 USD
     * @param collateralAmount Amount of collateral token
     * @param token Collateral token address
     */
    function borrow(uint256 collateralAmount, IERC20Upgradeable token)
        external
        nonReentrant
    {
        require(
            enabledTokens[token],
            'WQBorrowing: This token is disabled to collateral'
        );
        BorrowInfo storage loan = borrowers[msg.sender];
        require(!loan.borrowed, 'WQBorrowing: You are not refunded loan');
        loan.borrowed = true;
        loan.collateral = collateralAmount;
        loan.token = token;
        loan.borrowedAt = block.timestamp;
        loan.apy = apy;
        uint256 price = oracle.getTokenPriceUSD(
            IERC20MetadataUpgradeable(address(token)).symbol()
        );
        loan.credit = (collateralAmount * price * 2) / 3e18;
        loan.price = price;

        bool success = false;
        for (uint256 i = 0; i < funds.length; i++) {
            if (loan.credit >= funds[i].balanceOf()) {
                funds[i].borrow(loan.credit);
                success = true;
                loan.fund = funds[i];
                break;
            }
        }
        require(success, 'WQBorrowing: Error when loaned from funds');

        // Take tokens
        loan.token.safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );
        // Send native coins
        payable(msg.sender).sendValue(loan.credit);
        emit Borrowed(collateralAmount, token, price, loan.credit, msg.sender);
    }

    /**
     * @notice Refund loan
     */
    function refund() external payable nonReentrant {
        BorrowInfo storage loan = borrowers[msg.sender];
        require(loan.borrowed, 'WQBorrowing: You a not loaned funds');
        require(enabledTokens[loan.token], 'WQBorrowing: Token is disabled');
        uint256 fee = ((block.timestamp - loan.borrowedAt) *
            loan.credit *
            loan.apy) /
            YEAR /
            1e18;
        // Take native coins
        require(
            msg.value >= loan.credit + fee,
            'WQBorrowing: Invalid refund amount'
        );
        loan.borrowed = false;
        loan.credit = 0;
        // and send back to fund
        loan.fund.refund{value: loan.credit + fee}(fee);
        //Send tokens
        loan.token.safeTransfer(msg.sender, loan.collateral);
        loan.collateral = 0;
        // Return change
        if (msg.value > loan.credit + fee) {
            payable(msg.sender).sendValue(msg.value - loan.credit - fee);
        }
        emit Refunded(msg.sender, msg.value);
    }

    /**
     * @notice Add address of fund
     * @param fund Address of fund
     */
    function addFund(address fund) external onlyRole(ADMIN_ROLE) {
        funds.push(WQFundInterface(fund));
    }

    /**
     * @notice Update address of fund
     * @param index index of funds
     * @param fund Address of fund
     */
    function updateFund(uint256 index, address fund)
        external
        onlyRole(ADMIN_ROLE)
    {
        funds[index] = WQFundInterface(fund);
    }

    /**
     * @notice Remove address from funds
     * @param index index of fund
     */
    function removeFund(uint256 index) external onlyRole(ADMIN_ROLE) {
        funds[index] = funds[funds.length - 1];
        funds.pop();
    }

    /**
     * @notice Set rate per year amount
     * @param _apy Fee amount
     */
    function setApy(uint256 _apy) external onlyRole(ADMIN_ROLE) {
        apy = _apy;
    }
}
