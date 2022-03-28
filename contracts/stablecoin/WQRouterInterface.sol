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

    function totalCollateral() external view returns (uint256);

    function totalCollateral(string calldata symbol)
        external
        view
        returns (uint256);

    function totalDebt() external view returns (uint256);

    function fixedRate() external view returns (uint256);

    function annualInterestRate() external view returns (uint256);

    function moveUserLot(
        address user,
        uint256 collateral,
        uint256 price,
        uint256 priceIndex,
        uint256 index,
        uint256 newPriceIndex,
        uint256 newIndex,
        string calldata symbol
    ) external;

    function buyCollateral(
        uint256 priceIndex,
        uint256 index,
        uint256 fee,
        string calldata symbol
    ) external payable;

    function transferSurplus(
        address payable to,
        uint256 amount,
        uint256 cost
    ) external;

    function transferDebt(address to, uint256 amount) external payable;
}
