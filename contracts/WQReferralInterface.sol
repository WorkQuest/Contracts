// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface WQReferralInterface {
    function calcReferral(address referral, uint256 earnedAmount) external;
}
