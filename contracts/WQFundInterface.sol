// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface WQFundInterface {
    function balanceOf() external view returns (uint256);

    function borrow(uint256 amount) external;
    
    function refund() external payable;
}
