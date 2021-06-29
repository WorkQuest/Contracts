// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WUSDToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("Work USD Token", "WUSD") {
        _mint(msg.sender, initialSupply);
    }
}
