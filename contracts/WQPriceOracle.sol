// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract WQPriceOracle is AccessControl {
    
    function getTokenPriceUSD() external returns (uint256 price_) {         // ATTENTION it's just for testing 
        price_ = 228 * (10 ** 18) ;
        return price_;
    }

}