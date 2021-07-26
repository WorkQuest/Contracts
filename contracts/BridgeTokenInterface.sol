// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

interface BridgeTokenInterface {
    function mint(address account, uint256 amount) external;

    function burn(address account, uint256 amount) external;
}
