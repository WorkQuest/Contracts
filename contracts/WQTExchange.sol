// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

import './WQBridgeTokenInterface.sol';

contract WQTExchange is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Admin role constant
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    IERC20Upgradeable public oldToken;
    WQBridgeTokenInterface public newToken;

    uint256 public totalSwapped;

    mapping(address => bool) blacklist;

    event Swapped(uint256 timestamp, address owner, uint256 amount);

    modifier onlyNotBlacklisted() {
        require(!blacklist[msg.sender], 'WQTExchange: You are blacklisted');
        _;
    }

    function initialize(address _oldToken, address _newToken)
        public
        initializer
    {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        oldToken = IERC20Upgradeable(_oldToken);
        newToken = WQBridgeTokenInterface(_newToken);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    function swap(uint256 amount)
        external
        nonReentrant
        onlyNotBlacklisted
        whenNotPaused
    {
        totalSwapped += amount;
        oldToken.safeTransferFrom(msg.sender, address(this), amount);
        WQBridgeTokenInterface(newToken).mint(msg.sender, amount);
        emit Swapped(block.timestamp, msg.sender, amount);
    }

    function setTokens(address _oldToken, address _newToken) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            'WQTExchange: You do not have an admin role'
        );
        oldToken = IERC20Upgradeable(_oldToken);
        newToken = WQBridgeTokenInterface(_newToken);
    }

    function setTotalSwapped(uint256 amount) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            'WQTExchange: You do not have an admin role'
        );
        totalSwapped = amount;
    }

    function addToBlacklist(address account) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            'WQTExchange: You do not have an admin role'
        );
        blacklist[account] = true;
    }

    function pause() external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            'WQTExchange: You do not have an admin role'
        );
        _pause();
    }

    function unpause() external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            'WQTExchange: You do not have an admin role'
        );
        _unpause();
    }
}
