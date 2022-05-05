// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface WorkQuestFactoryInterface {
    function hasRole(bytes32 role, address account)
        external
        view
        returns (bool);

    function workquestValid(address workquest) external view returns (bool);

    function feeEmployer() external view returns (uint256);

    function feeWorker() external view returns (uint256);

    function feeTx() external view returns (uint256);

    function feeReceiver() external view returns (address);

    function pensionFund() external view returns (address);

    function referral() external view returns (address);

    function wusd() external view returns (address);
}
