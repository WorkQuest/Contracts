// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface WQRouterInterface {
    struct TokenSettings {
        uint256 index;
        uint256 totalCollateral;
        address token;
        address collateralAuction;
        bool enabled;
    }

    function tokens(string calldata symbol)
        external
        view
        returns (TokenSettings memory);

    function moveUserLot(
        address user,
        uint256 collateral,
        uint256 price,
        uint256 collateralRatio,
        uint256 index,
        uint256 newIndex,
        string calldata symbol
    ) external;

    function buyCollateral(
        address buyer,
        uint256 index,
        uint256 debtAmount,
        uint256 collateralAmount,
        string calldata symbol
    ) external payable;
}
