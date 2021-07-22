// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

interface WQTInterface {
    function getPastVotes(address account, uint256 blockNumber)
        external
        view
        returns (uint256);

    function getVotes(address account)
        external
        view
        returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address recipient, uint256 amount)
        external
        returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}