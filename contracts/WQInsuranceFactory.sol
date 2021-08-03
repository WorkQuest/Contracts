// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "./WQInsurance.sol";

contract WQInsuranceFactory {
    uint256 constant MONTH = 2592000;
    uint256 constant YEAR = 31536000;

    uint256 constant minimalContribution = 1000e18;
    uint256 constant mediumContribution = 2000e18;
    uint256 constant maximalContribution = 3000e18;

    address[] insurances;

    enum PolicyType {
        Minimal,
        Medium,
        Maximal
    }

    enum ContributionPeriod {
        Monthly,
        Yearly
    }

    constructor() {}

    function newInsurance(ContributionPeriod _period, PolicyType policyType) external {
        uint256 _contributionPeriod;
        if (_period == ContributionPeriod.Monthly) {
            _contributionPeriod = MONTH;
        } else if (_period == ContributionPeriod.Yearly) {
            _contributionPeriod = YEAR;
        }
        uint256 _contributionAmount;
        if (policyType == PolicyType.Minimal) {
            _contributionAmount = minimalContribution;
        } else if (policyType == PolicyType.Medium) {
            _contributionAmount = mediumContribution;
        } else if (policyType == PolicyType.Maximal) {
            _contributionAmount = maximalContribution;
        }
        insurances.push(
            address(new WQInsurance(_contributionPeriod, _contributionAmount))
        );
    }

    function getInsurances() external view returns (address[] memory){
        return insurances;
    }
}
