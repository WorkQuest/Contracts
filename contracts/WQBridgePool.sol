// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

contract WQBridgePool is AccessControlUpgradeable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant BRIDGE_ROLE = keccak256('BRIDGE_ROLE');

    bool private initialized;

    event Transferred(address recipient, uint256 amount, address token);

    function initialize() external {
        require(!initialized, 'WQBridgePool: The contract has already been initialized');
        initialized = true;
        __AccessControl_init();
        __Pausable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setRoleAdmin(BRIDGE_ROLE, ADMIN_ROLE);
    }

    function transfer(
        address recipient,
        uint256 amount,
        address token
    ) external onlyRole(BRIDGE_ROLE) whenNotPaused {
        IERC20Upgradeable(token).safeTransfer(recipient, amount);
        emit Transferred(recipient, amount, token);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}
