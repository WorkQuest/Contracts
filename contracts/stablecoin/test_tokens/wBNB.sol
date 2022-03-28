// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract wBNB is ERC20PresetMinterPauser {
    constructor() ERC20PresetMinterPauser("WQ BNB wrapped", "BNB"){
        _mint(msg.sender, 1000000000000000000000000);
    }
}