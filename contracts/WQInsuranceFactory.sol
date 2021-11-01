// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';

import './WQInsurance.sol';

contract WQInsuranceFactory is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    uint256 constant MONTH = 2592000;
    uint256 constant YEAR = 31536000;

    uint256 constant minimalContribution = 1000e18;
    uint256 constant mediumContribution = 2000e18;
    uint256 constant maximalContribution = 3000e18;

    WQInsurance[] public insurances; // TO_ASK Is it needed?

    enum PolicyType {
        Minimal,
        Medium,
        Maximal
    }

    enum ContributionPeriod {
        Monthly,
        Yearly
    }

    mapping(ContributionPeriod => mapping(PolicyType => WQInsurance))
        public getLastProperInsurance;

    event InsuranceCreated(uint256 timestamp, address indexed isurance);
    event MemberAdded(uint256 timestamp, address indexed member);

    /**
     * @notice initialize the contract
     *
     */
    function initialize() public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    function addUserToInsurance(
        ContributionPeriod period,
        PolicyType policy,
        address member
    ) external {
        WQInsurance insurance = getLastProperInsurance[period][policy];
        if (
            insurance == WQInsurance(payable(0)) ||
            insurance.memberCount() >= 10
        ) {
            WQInsurance newInsurance = _newInsurance(period, policy);
            newInsurance.addMember(member);
            getLastProperInsurance[period][policy] = newInsurance;
        } else {
            insurance.addMember(member);
        }
        emit MemberAdded(block.timestamp, member);
    }

    function _newInsurance(ContributionPeriod period, PolicyType policy)
        internal
        returns (WQInsurance insurance)
    {
        uint256 _contributionPeriod;
        if (period == ContributionPeriod.Monthly) {
            _contributionPeriod = MONTH;
        } else if (period == ContributionPeriod.Yearly) {
            _contributionPeriod = YEAR;
        }
        uint256 _contributionAmount;
        if (policy == PolicyType.Minimal) {
            _contributionAmount = minimalContribution;
        } else if (policy == PolicyType.Medium) {
            _contributionAmount = mediumContribution;
        } else if (policy == PolicyType.Maximal) {
            _contributionAmount = maximalContribution;
        }
        insurance = new WQInsurance(_contributionPeriod, _contributionAmount);
        insurances.push(insurance);
        emit InsuranceCreated(block.timestamp, address(insurance));
    }

    function getInsurances() external view returns (WQInsurance[] memory) {
        return insurances;
    }
}
