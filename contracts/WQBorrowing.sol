// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./WQPriceOracle.sol";
import "./WQFundInterface.sol";

contract WQBorrowing is AccessControl {
    using SafeERC20 for IERC20;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct TokenInfo {
        uint256 amount;
        bool enabled;
    }

    struct BorrowInfo {
        uint256 amount;
        uint256 collateral;
        bool borrowed;
        IERC20 token;
        WQFundInterface fund;
    }

    bool private _initialized;
    uint256 public fee;

    WQFundInterface[] funds;

    mapping(IERC20 => TokenInfo) collateralTokens;

    mapping(address => BorrowInfo) borrowers;

    event Borrowed(
        uint256 collateral,
        IERC20 token,
        uint256 loan,
        address borrower
    );
    event Refunded(address to, uint256 amount);

    function initialize() external {
        require(
            !_initialized,
            "WQBorrowing: Contract instance has already been initialized"
        );
        _initialized = true;
    }

    function borrow(uint256 collateral, IERC20 token) external {
        require(
            collateralTokens[token].enabled,
            "WQBorrowing: Token is disabled"
        );
        BorrowInfo storage loan = borrowers[msg.sender];
        require(!loan.borrowed, "WQBorrowing: You are not refunded loan");
        loan.borrowed = true;
        loan.collateral = collateral;
        loan.token = token;
        uint256 price = 0; // TODO: get price from oracle
        loan.amount = (collateral * price) / 1e18;

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
        require(success, "WQBorrowing: Error when loaned from funds");

        // Take tokens
        loan.token.safeTransferFrom(msg.sender, address(this), collateral);
        // Send native coins
        payable(msg.sender).transfer(loan.amount);
        emit Borrowed(collateral, token, loan.amount, msg.sender);
    }

    function refund() external payable {
        BorrowInfo storage loan = borrowers[msg.sender];
        require(
            collateralTokens[loan.token].enabled,
            "WQBorrowing: Token is disabled"
        );
        uint256 returned = loan.amount + (fee * loan.amount) / 1e18;
        // Take native coins
        require(returned == msg.value, "WQBorrowing: Invalid refund amount");
        loan.fund.refund{value: msg.value}();
        //Send tokens
        loan.token.safeTransfer(msg.sender, loan.collateral);
        emit Refunded(msg.sender, msg.value);
    }

    function addFund(address fund) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "WQBorrowing: You are not have an admin role"
        );
        funds.push(WQFundInterface(fund));
    }

    function setFee(uint256 _fee) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "WQBorrowing: You are not have an admin role"
        );
        fee = _fee;
    }
}
