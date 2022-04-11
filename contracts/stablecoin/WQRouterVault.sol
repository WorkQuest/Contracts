// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract WQRouterVault {
    using SafeERC20 for IERC20;
    using Address for address payable;

    address public router;
    address public owner;

    event Transferred(address token, address recipient, uint256 amount);

    modifier onlyRouter() {
        require(msg.sender == router, "WQRouterVault: Sender is not router");
        _;
    }

    constructor(address _owner) {
        router = msg.sender;
        owner = _owner;
    }

    function transfer(
        address payable recipient,
        uint256 _amount,
        address token
    ) external onlyRouter {
        if (token != address(0)) {
            IERC20(token).safeTransfer(recipient, _amount);
        } else {
            recipient.sendValue(_amount);
        }
        emit Transferred(token, recipient, _amount);
    }
}
