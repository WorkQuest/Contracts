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

    function getCollateral(string calldata symbol)
        external
        view
        returns (uint256);

    function getDebt(string calldata symbol) external view returns (uint256);

    function fixedRate() external view returns (uint256);

    function annualInterestRate() external view returns (uint256);

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
        uint256 comission,
        uint256 ratio,
        string calldata symbol
    ) external payable;

    function transferSurplus(
        address to,
        uint256 amount,
        string calldata symbol
    ) external payable;

    function transferDebt(
        address to,
        uint256 amount,
        uint256 cost,
        string calldata symbol
    ) external;
}
