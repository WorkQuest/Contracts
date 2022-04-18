// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface WorkQuestFactoryInterface {
    function hasRole(bytes32 role, address account)
        external
        view
        returns (bool);

    function workquestValid(address workquest) external view returns (bool);
}
