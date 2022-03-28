// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WQT is ERC20 {
    constructor() ERC20("Work Quest token", "WQT"){
        _mint(msg.sender, 1000000000000000000000000);
    }
}