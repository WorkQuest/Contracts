// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import './WQPriceOracle.sol';
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

    struct TokenInfo {
        uint256 amount;
        bool enabled;
    }

    struct BorrowInfo {
        uint256 amount;
        uint256 collateral;
        bool borrowed;
        IERC20Upgradeable token;
        WQFundInterface fund;
    }

    uint256 public fee;
    WQPriceOracle oracle;

    WQFundInterface[] funds;

    mapping(IERC20Upgradeable => TokenInfo) collateralTokens;

    mapping(address => BorrowInfo) borrowers;

    event Borrowed(
        uint256 collateral,
        IERC20Upgradeable token,
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
     * @param collateral Amount of collateral token
     * @param token Collateral token address
     */
    function borrow(uint256 collateral, IERC20Upgradeable token) external {
        require(
            collateralTokens[token].enabled,
            'WQBorrowing: Token is disabled'
        );
        BorrowInfo storage loan = borrowers[msg.sender];
        require(!loan.borrowed, 'WQBorrowing: You are not refunded loan');
        loan.borrowed = true;
        loan.collateral = collateral;
        loan.token = token;
        loan.amount =
            ((collateral * oracle.getTokenPriceUSD(IERC20MetadataUpgradeable(address(token)).symbol())) * 1000) /
            1500e18;

        //TODO: check funds on contracts and request it
        bool success = false;
        for (uint256 i = 0; i < funds.length; i++) {
            if (loan.amount > funds[i].balanceOf()) {
                funds[i].borrow(loan.amount);
                success = true;
                loan.fund = funds[i];
                break;
            }
        }
        require(success, 'WQBorrowing: Error when loaned from funds');

        // Take tokens
        loan.token.safeTransferFrom(msg.sender, address(this), collateral);
        // Send native coins
        payable(msg.sender).transfer(loan.amount);
        emit Borrowed(collateral, token, loan.amount, msg.sender);
    }

    /**
     * @notice Refund loan
     */
    function refund() external payable {
        BorrowInfo storage loan = borrowers[msg.sender];
        require(
            collateralTokens[loan.token].enabled,
            'WQBorrowing: Token is disabled'
        );
        uint256 returned = loan.amount + (fee * loan.amount) / 1e18;
        // Take native coins
        require(returned == msg.value, 'WQBorrowing: Invalid refund amount');
        // and send back to fund
        loan.fund.refund{value: msg.value}();
        //Send tokens
        loan.token.safeTransfer(msg.sender, loan.collateral);
        emit Refunded(msg.sender, msg.value);
    }

    /**
     * @notice Add address of fund
     * @param fund Address of fund
     */
    function addFund(address fund) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            'WQBorrowing: You are not have an admin role'
        );
        funds.push(WQFundInterface(fund));
    }

    /**
     * @notice Set fee for loan using
     * @param _fee Fee amount
     */
    function setFee(uint256 _fee) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            'WQBorrowing: You are not have an admin role'
        );
        fee = _fee;
    }
}
