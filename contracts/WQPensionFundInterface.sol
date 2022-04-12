// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface WQPensionFundInterface {
    function getFee(address user) external view returns (uint256);

    function contribute(address worker, uint256 amount) external;
}
