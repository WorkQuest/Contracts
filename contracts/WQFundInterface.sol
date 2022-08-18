// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface WQFundInterface {
    function apys(uint256 duration) external view returns (uint256);

    function balanceOf(address depositor) external view returns (uint256);

    function borrow(
        address depositor,
        uint256 amount,
        uint256 duration
    ) external returns (uint256);

    function refund(
        address depositor,
        uint256 amount,
        uint256 elapsedTime,
        uint256 duration
    ) external;
}
