// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';

contract WQDAOVault {
    using SafeERC20 for IERC20;
    using Address for address payable;

    address public dao;
    address payable public owner;

    event Transferred(address recipient, uint256 amount);
    event Received(uint256 amount);

    modifier onlyDAO() {
        require(msg.sender == dao, 'WQRouterVault: Sender is not router');
        _;
    }

    constructor(address payable _owner) {
        dao = msg.sender;
        owner = _owner;
    }

    receive() external payable {
        emit Received(msg.value);
    }

    function transfer(uint256 _amount) external onlyDAO {
        owner.sendValue(_amount);
        emit Transferred(owner, _amount);
    }
}
