// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WQToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("WorkQuest Token", "WQT") {
        _mint(msg.sender, initialSupply);
    }
}
