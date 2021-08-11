// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract WQReferal is AccessControl {
    using SafeERC20 for IERC20;

    /**
     * @dev The struct of account information
     * @param referrer The referrer addresss
     * @param reward The total referral reward of an address
     * @param referredCount The total referral amount of an address
     * @param lastActiveTimestamp The last active timestamp of an address
     */
    struct Account {
        address payable referrer;
        uint256 reward;
        uint256 referredCount;
        uint256 lastActiveTimestamp;
    }

    bool private _initialized;

    mapping(address => Account) public accounts;

    event RegisteredReferer(address referee, address referrer);

    function initialize() external {
        require(
            !_initialized,
            "WQReferal: Contract instance has already been initialized"
        );

        _initialized = true;
    }

    function addReferrer(address payable referrer) internal returns (bool) {
        require(
            referrer != address(0),
            "WQReferal: Referrer cannot be zero address"
        );
        require(
            referrer != msg.sender,
            "WQReferal: Referrer cannot be sender address"
        );
        require(
            accounts[msg.sender].referrer == address(0),
            "WQReferal: Address have been registered upline"
        );

        Account storage userAccount = accounts[msg.sender];
        Account storage parentAccount = accounts[referrer];

        userAccount.referrer = referrer;
        userAccount.lastActiveTimestamp = block.timestamp;
        parentAccount.referredCount += 1;

        emit RegisteredReferer(msg.sender, referrer);
        return true;
    }

    /**
     * @dev Utils function for check whether an address has the referrer
     */
    function hasReferrer(address addr) public view returns (bool) {
        return accounts[addr].referrer != address(0);
    }

    /**
     * @dev
     */

    function payReferral() external returns (uint256) {
    }
}
