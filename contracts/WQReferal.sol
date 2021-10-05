// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';

import './WQTInterface.sol';

contract WQReferal is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

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

    IERC20Upgradeable token;
    uint256 referralBonus;

    mapping(address => Account) public accounts;

    event RegisteredReferer(address referee, address referrer);
    event PaidReferral(address from, address to, uint256 amount);

    function initialize(address _token, uint256 _referralBonus)
        public
        initializer
    {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);

        token = IERC20Upgradeable(_token);
        referralBonus = _referralBonus;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    function addReferrer(address referrer) external {
        require(
            referrer != address(0),
            'WQReferal: Referrer cannot be zero address'
        );
        require(
            referrer != msg.sender,
            'WQReferal: Referrer cannot be sender address'
        );
        require(
            accounts[msg.sender].referrer == address(0),
            'WQReferal: Address is already registered'
        );
        accounts[msg.sender].referrer = referrer;
        accounts[referrer].referredCount++;

        emit RegisteredReferer(msg.sender, referrer);
    }

    /**
     * @dev Utils function for check whether an address has the referrer
     */
    function hasReferrer(address addr) external view returns (bool) {
        return accounts[addr].referrer != address(0);
    }

    /**
     * @dev Pay referal to registered referrer
     */

    function payReferral(address referee) external nonReentrant {
        require(
            token.balanceOf(address(this)) > referralBonus,
            'WQReferal: Balance on contract too low'
        );
        Account storage userAccount = accounts[referee];
        require(!userAccount.paid, 'WQReferal: Bonus already paid');
        require(
            userAccount.referrer != address(0),
            'WQReferal: Address is not registered'
        );
        userAccount.paid = true;
        accounts[userAccount.referrer].reward += referralBonus;
        token.safeTransfer(userAccount.referrer, referralBonus);
        emit PaidReferral(referee, userAccount.referrer, referralBonus);
    }
}
