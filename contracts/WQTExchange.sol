// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

import './WQBridgeTokenInterface.sol';

contract WQTExchange is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice Admin role constant
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

    IERC20 public oldToken;
    WQBridgeTokenInterface public newToken;

    uint256 public totalSwapped;

    mapping(address => bool) blacklist;

    event Swapped(uint256 timestamp, address owner, uint256 amount);

    modifier onlyNotBlacklisted() {
        require(!blacklist[msg.sender], 'WQTExchange: You are blacklisted');
        _;
    }

    constructor(address _oldToken, address _newToken) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        oldToken = IERC20(_oldToken);
        newToken = WQBridgeTokenInterface(_newToken);
    }

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
        oldToken = IERC20(_oldToken);
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

    function removeAnyToken(
        address token,
        address account,
        uint256 amount
    ) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            'WQTExchange: You do not have an admin role'
        );
        IERC20(token).safeTransfer(account, amount);
    }
}
