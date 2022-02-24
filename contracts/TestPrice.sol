// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./WQPriceOracle.sol";

contract TestPrice {
    constructor() {}

    function setAndGetPrice(
        WQPriceOracle oracle,
        uint256 nonce,
        uint256 price,
        uint8 v,
        bytes32 r,
        bytes32 s,
        string memory symbol
    ) external returns (uint256) {
        oracle.setTokenPriceUSD(nonce, price, v, r, s, symbol);
        return oracle.getTokenPriceUSD(symbol);
    }
}
