// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./WQTInterface.sol";

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
        address referrer;
        uint256 reward;
        uint256 referredCount;
        bool paid;
    }

    bool private _initialized;

    WQTInterface token;
    uint256 referralBonus;

    mapping(address => Account) public accounts;

    event RegisteredReferer(address referee, address referrer);
    event PaidReferral(address from, address to, uint256 amount);

    function initialize(address _token, uint256 _referralBonus) external {
        require(
            !_initialized,
            "WQReferal: Contract instance has already been initialized"
        );
        token = WQTInterface(_token);
        referralBonus = _referralBonus;
        _initialized = true;
    }

    function addReferrer(address referrer) internal returns (bool) {
        require(
            referrer != address(0),
            "WQReferal: Referrer cannot be zero address"
        );
        require(
            referrer != msg.sender,
            "WQReferal: Referrer cannot be sender address"
        );
        Account storage userAccount = accounts[msg.sender];
        require(
            userAccount.referrer == address(0),
            "WQReferal: Address is already registered"
        );
        Account storage parentAccount = accounts[referrer];
        userAccount.referrer = referrer;
        parentAccount.referredCount++;

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
     * @dev Pay referal to registered referrer
     */

    function payReferral() external {
        require(
            token.balanceOf(address(this)) > referralBonus,
            "WQReferal: Balance on contract too low"
        );
        Account storage userAccount = accounts[msg.sender];
        require(!userAccount.paid, "WQReferal: Bonus already paid");
        require(
            userAccount.referrer != address(0),
            "WQReferal: Address is not registered"
        );
        accounts[userAccount.referrer].reward += referralBonus;
        token.transfer(userAccount.referrer, referralBonus);
        emit PaidReferral(msg.sender, userAccount.referrer, referralBonus);
    }
}
