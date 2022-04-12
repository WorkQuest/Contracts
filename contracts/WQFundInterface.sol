// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface WQFundInterface {
    function apys(uint256 duration) external view returns (uint256);

    function balanceOf() external view returns (uint256);

    function borrow(uint256 amount) external;

    function refund(
        uint256 amount,
        uint256 elapsedTime,
        uint256 duration
    ) external;
}
