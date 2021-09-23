// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "./WQInsurance.sol";

contract WQInsuranceFactory {
    uint256 constant MONTH = 2592000;
    uint256 constant YEAR = 31536000;

    uint256 constant minimalContribution = 1000e18;
    uint256 constant mediumContribution = 2000e18;
    uint256 constant maximalContribution = 3000e18;

    address[] insurances;   // TO_ASK Is it needed? 

    enum PolicyType {
        Minimal,
        Medium,
        Maximal
    }

    enum ContributionPeriod {
        Monthly,
        Yearly
    }

    struct insuranceInfo {
        ContributionPeriod period;
        PolicyType policy; 
        uint256 usersNum;
    }

    mapping(ContributionPeriod => mapping(PolicyType => address )) getLastProperInsuarance;
    mapping(address  => insuranceInfo) insurancesData;
    bool private initialized;
    
    /** 
     * @notice initialize the contract 
     *
     */
    function initialize() public {
        require(!initialized, "Contract WQDAOInsuarance has already been initialized");
        initialized = true;
    }

    function addUserToInsuarance(
        ContributionPeriod _period,
        PolicyType _policy,
        address _user
    ) external {
        address payable insuarance = payable(getLastProperInsuarance[_period][_policy]);
        insuranceInfo storage data = insurancesData[insuarance];
        if (data.usersNum == 10 || insuarance == address(0)) { 
            address newInsurance =  _newInsurance(_period, _policy);
            WQInsurance(payable(newInsurance)).addMember(_user);
            insuranceInfo storage newData = insurancesData[newInsurance];
            newData.period = _period;
            newData.policy = _policy;
            newData.usersNum = 1;
            getLastProperInsuarance[_period][_policy] = newInsurance;
        } else {
            WQInsurance(insuarance).addMember(_user); 
            data.usersNum++;
        }
    }

    function _newInsurance(ContributionPeriod _period, PolicyType policyType) internal returns (address insurance_){
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
        insurance_ = insurances[insurances.length-1];
    }

    function getInsurances() external view returns (address[] memory){
        return insurances;
    }
}
