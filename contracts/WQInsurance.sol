// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/access/AccessControl.sol';

contract WQInsurance is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant FACTORY_ROLE = keccak256('FACTORY_ROLE');

    struct MemberInfo {
        uint256 firstContribution;
        uint256 lastContribution;
        uint256 contributed;
        bool enabled;
    }

    struct ClaimInfo {
        uint256 asked;
        uint256 numConfirm;
        bool active;
        bool executed;
    }

    /// @dev Max number of members
    uint256 constant MAX_MEMBERS = 10;

    /// @dev Seconds in year
    uint256 constant YEAR = 31536000;

    uint256 public contributionPeriod;
    uint256 public contributionAmount;

    address[] public members;
    mapping(address => MemberInfo) public memberInfo;
    uint256 public memberCount;

    mapping(address => ClaimInfo) public claims;
    mapping(address => mapping(address => bool)) public confirmations;

    event Received(uint256 timestamp, uint256 amount, address user);

    event MemberAdded(uint256 timestamp, address user);

    event MemberRemoved(uint256 timestamp, address user);

    event PaymentClaimed(uint256 timestamp, address user, uint256 amount);

    event ClaimRemoved(uint256 timestamp, address user);

    event PaymentConfirmed(uint256 timestamp, address member, address user);

    event ConfirmationRevoked(uint256 timestamp, address member, address user);

    event PaymentExecuted(uint256 timestamp, uint256 amount, address user);

    /** @notice Initialize the contract
     *
     *  @param _contributionPeriod how often users pay for insurance
     *  @param _contributionAmount amount of insurance
     */
    constructor(uint256 _contributionPeriod, uint256 _contributionAmount) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(FACTORY_ROLE, msg.sender);
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        contributionPeriod = _contributionPeriod;
        contributionAmount = _contributionAmount;
    }

    /**
     * @notice Get all addresses of members
     */
    function getMembers() external view returns (address[] memory) {
        return members;
    }

    /**
     * @notice Add member to contract
     * Emits a {MemberAdded} event
     */
    function addMember(address member) external {
        require(
            hasRole(FACTORY_ROLE, msg.sender),
            'WQInsurance: Only factory can add members to contract'
        );
        require(
            memberCount < MAX_MEMBERS,
            'WQInsurance: Members quantity should be less than 10'
        );
        require(
            !memberInfo[member].enabled,
            'WQInsurance: Member already registered in contract'
        );
        members.push(member);
        memberInfo[member].enabled = true;
        memberCount++;
        emit MemberAdded(block.timestamp, member);
    }

    /**
     * @notice Remove member from contract
     * Emits a {MemberRemoved} event
     */
    function removeMember() external {
        require(
            memberInfo[msg.sender].enabled,
            'WQInsurance: Member already removed from contract'
        );
        memberInfo[msg.sender].enabled = false;
        memberCount--;
        //remove all confirmations for this member
        for (uint256 i = 0; i < members.length; i++) {
            if (confirmations[members[i]][msg.sender] == true) {
                confirmations[members[i]][msg.sender] = false;
            }
        }
        emit MemberRemoved(block.timestamp, msg.sender);
    }

    /**
     * @notice Contribute funds to contract
     */
    receive() external payable {
        MemberInfo storage member = memberInfo[msg.sender];
        require(member.enabled, 'WQInsurance: Member not found');
        if (contributionPeriod == YEAR) {
            require(
                msg.value == contributionAmount,
                'WQInsurance: Invalid contribution amount'
            );
        } else {
            require(
                msg.value == contributionAmount / 12,
                'WQInsurance: Invalid contribution amount'
            );
        }
        member.contributed += msg.value;
        member.lastContribution = block.timestamp;
        if (member.firstContribution == 0) {
            member.firstContribution = block.timestamp;
        }
        emit Received(msg.value, block.timestamp, msg.sender);
    }

    /**
     * @notice Ask funds from contract
     */
    function claim() external {
        require(
            memberInfo[msg.sender].enabled,
            'WQInsurance: Member not found'
        );
        require(
            memberCount > 1,
            'WQInsurance: The contract must contain more than one members'
        );
        require(
            block.timestamp <
                memberInfo[msg.sender].lastContribution +
                    contributionPeriod +
                    7 days,
            'WQInsurance: Your policy is suspended'
        );
        require(
            !claims[msg.sender].executed,
            'WQInsurance: Payment is already executed'
        );
        require(
            !claims[msg.sender].active,
            'WQInsurance: Payment is already asked'
        );
        claims[msg.sender].active = true;
        claims[msg.sender].asked = (memberInfo[msg.sender].contributed * 5) / 6;
        confirmations[msg.sender][msg.sender] = true;
        claims[msg.sender].numConfirm = 1;
        emit PaymentClaimed(
            block.timestamp,
            msg.sender,
            claims[msg.sender].asked
        );
    }

    /**
     * @notice Cancel claim funds
     */
    function unclaim() external {
        require(
            memberInfo[msg.sender].enabled,
            'WQInsurance: Member not found'
        );
        require(
            !claims[msg.sender].executed,
            'WQInsurance: Payment is already executed'
        );
        require(
            claims[msg.sender].active,
            'WQInsurance: Claim is already revoked'
        );
        claims[msg.sender].active = false;
        claims[msg.sender].numConfirm = 0;

        //Revoke all confirmations
        for (uint256 i = 0; i < members.length; i++) {
            if (confirmations[msg.sender][members[i]] == true) {
                confirmations[msg.sender][members[i]] = false;
            }
        }
        emit ClaimRemoved(block.timestamp, msg.sender);
    }

    /**
     * @notice Confirm payment from other members
     */
    function confirmPayment(address member) external {
        require(memberInfo[member].enabled, 'WQInsurance: Member not found');
        require(
            memberInfo[msg.sender].enabled,
            'WQInsurance: You are not a member'
        );
        require(claims[member].active, 'WQInsurance: Claim is not active');
        require(
            !confirmations[member][msg.sender],
            'WQInsurance: Payment is already confirmed'
        );
        claims[member].numConfirm++;
        confirmations[member][msg.sender] = true;
        emit PaymentConfirmed(block.timestamp, member, msg.sender);
    }

    /**
     * @notice Revoke confirmation payment
     */
    function revokeConfirmation(address member) external {
        require(memberInfo[member].enabled, 'WQInsurance: Member not found');
        require(
            memberInfo[msg.sender].enabled,
            'WQInsurance: You are not a member'
        );
        require(
            confirmations[member][msg.sender],
            'WQInsurance: Payment is already revoked confirmation'
        );
        claims[member].numConfirm--;
        confirmations[member][msg.sender] = false;
        emit ConfirmationRevoked(block.timestamp, member, msg.sender);
    }

    /**
     * @notice Payment executed when all member confirmed it
     */
    function executePayment() external {
        require(
            memberInfo[msg.sender].enabled,
            'WQInsurance: You are not a member'
        );
        require(
            memberCount > 1,
            'WQInsurance: The contract must contain more than one members'
        );
        require(
            block.timestamp <
                memberInfo[msg.sender].lastContribution +
                    contributionPeriod +
                    7 days,
            'WQInsurance: Your policy is suspended'
        );
        ClaimInfo storage claimInfo = claims[msg.sender];
        require(
            !claimInfo.executed,
            'WQInsurance: Payment is already executed'
        );
        require(claimInfo.active, 'WQInsurance: Payment is not asked');
        require(
            claimInfo.numConfirm == memberCount,
            'WQInsurance: Payment is not confirmed'
        );
        claimInfo.executed = true;
        claimInfo.active = false;
        payable(msg.sender).transfer(claimInfo.asked);
        emit PaymentExecuted(block.timestamp, claimInfo.asked, msg.sender);
    }

    /**
     * @notice withdraw after year
     */
    function withdraw() external {
        require(
            memberInfo[msg.sender].enabled,
            'WQInsurance: You are not a member'
        );
        require(
            memberInfo[msg.sender].firstContribution + YEAR >= block.timestamp,
            'WQInsurance: Your funds are still frozen '
        );
        payable(msg.sender).transfer(
            memberInfo[msg.sender].contributed - claims[msg.sender].asked
        );
    }
}
