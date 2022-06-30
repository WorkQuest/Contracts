// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface WQPriceOracleInterface {
    /**
     * @dev get price of token in USD
     * @param symbol symbol of token
     */
    function getTokenPriceUSD(string memory symbol)
        external
        view
        returns (uint256);

    function getTokenMaxRatio(string memory symbol)
        external
        view
        returns (uint256);

    /**
     * @dev Set price of token in USD
     * @param nonce Serial number of transaction
     * @param v V of signature
     * @param r R of signature
     * @param s S of signature
     * @param prices Price of token in USD
     * @param symbols Symbol of token
     */
    function setTokenPricesUSD(
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256[] calldata prices,
        string[] calldata symbols
    ) external;

    function updateToken(bool enabled, string calldata symbol) external;
}
