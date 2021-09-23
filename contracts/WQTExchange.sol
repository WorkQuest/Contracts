// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import './WQBridgeTokenInterface.sol';

contract WQTExchange is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Admin role constant
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

    IERC20 public oldToken;
    WQBridgeTokenInterface public newToken;

    uint256 public totalSwapped;

    event Swapped(uint256 timestamp, address owner, uint256 amount);

    constructor(address _oldToken, address _newToken) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        oldToken = IERC20(_oldToken);
        newToken = WQBridgeTokenInterface(_newToken);
    }

    function swap(uint256 amount) external nonReentrant {
        totalSwapped += amount;
        oldToken.safeTransferFrom(msg.sender, address(this), amount);
        WQBridgeTokenInterface(newToken).mint(msg.sender, amount);
        emit Swapped(block.timestamp, msg.sender, amount);
    }

    function setTokens(address _oldToken, address _newToken) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            'WQBorrowing: You are not have an admin role'
        );
        oldToken = IERC20(_oldToken);
        newToken = WQBridgeTokenInterface(_newToken);
    }

    function setTotalSwapped(uint256 amount) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            'WQBorrowing: You are not have an admin role'
        );
        totalSwapped = amount;
    }
}
