// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';

contract WQRouterVault is AccessControl {
    using SafeERC20 for IERC20;
    using Address for address payable;

    bytes32 public constant ROUTER_ROLE = keccak256('ROUTER_ROLE');

    event Transferred(address token, address recipient, uint256 amount);

    constructor() {
        _setupRole(ROUTER_ROLE, msg.sender);
    }

    function transfer(
        address payable recipient,
        uint256 amount,
        address token
    ) external onlyRole(ROUTER_ROLE) {
        if (token != address(0)) {
            IERC20(token).safeTransfer(recipient, amount);
        } else {
            recipient.sendValue(amount);
        }
        emit Transferred(token, recipient, amount);
    }
}
