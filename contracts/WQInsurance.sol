// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

contract WQInsurance {
    struct MemberInfo {
        uint256 lastContribution;
        uint256 contributed;
        bool enabled;
    }

    struct AskInfo {
        uint256 asked;
        uint256 numConfirm;
        bool active;
        bool executed;
    }

    uint256 constant MAX_MEMBERS = 10;

    uint256 public immutable contributionPeriod;
    uint256 public immutable contributionAmount;

    address[] public members;
    mapping(address => MemberInfo) public memberInfo;
    uint256 public memberCount;

    mapping(address => AskInfo) public asks;
    mapping(address => mapping(address => bool)) public confirmations;

    event Received(uint256 timestamp, uint256 amount, address user);

    event MemberAdded(uint256 timestamp, address user);

    event MemberRemoved(uint256 timestamp, address user);

    event PaymentAsked(uint256 timestamp, address user, uint256 amount);

    event AskRevoked(uint256 timestamp, address user);

    event PaymentConfirmed(uint256 timestamp, address member, address user);

    event ConfirmationRevoked(uint256 timestamp, address member, address user);

    event PaymentExecuted(uint256 timestamp, uint256 amount, address user);

    /**
     *
     */
    constructor(uint256 _contributionPeriod, uint256 _contributionAmount) {
        contributionPeriod = _contributionPeriod;
        contributionAmount = _contributionAmount;
    }

    /**
     *
     */
    function getMembers() external view returns (address[] memory) {
        return members;
    }

    /**
     *
     */
    function addMember(address member) external {
        require(
            memberCount < MAX_MEMBERS,
            "WQInsurance: Members quantity should be less than 10"
        );
        require(
            !memberInfo[member].enabled,
            "WQInsurance: Member already registered in contract"
        );
        members.push(member);
        memberInfo[member].enabled = true;
        memberCount++;
        emit MemberAdded(block.timestamp, member);
    }

    /**
     *
     */
    function removeMember(address member) external {
        require(
            memberInfo[member].enabled,
            "WQInsurance: Member already removed from contract"
        );
        memberInfo[member].enabled = false;
        memberCount--;
        emit MemberRemoved(block.timestamp, member);
    }

    /**
     *
     */
    receive() external payable {
        require(
            memberInfo[msg.sender].enabled,
            "WQInsurance: Member not found"
        );
        require(
            msg.value == contributionAmount,
            "WQInsurance: Invalid contribution amount"
        );
        memberInfo[msg.sender].contributed += msg.value;
        memberInfo[msg.sender].lastContribution = block.timestamp;
        emit Received(msg.value, block.timestamp, msg.sender);
    }

    /**
     *
     */
    function addAsk() external {
        require(
            memberInfo[msg.sender].enabled,
            "WQInsurance: Member not found"
        );
        require(
            memberInfo[msg.sender].lastContribution +
                contributionPeriod +
                7 days >
                block.timestamp,
            "WQInsurance: Your insurance is paused"
        );
        require(
            !asks[msg.sender].active,
            "WQInsurance: Payment is already asked"
        );
        require(
            !asks[msg.sender].executed,
            "WQInsurance: Payment is already executed"
        );
        asks[msg.sender].active = true;
        asks[msg.sender].asked = (memberInfo[msg.sender].contributed * 5) / 6;
        confirmations[msg.sender][msg.sender] = true;
        asks[msg.sender].numConfirm = 1;
        emit PaymentAsked(block.timestamp, msg.sender, asks[msg.sender].asked);
    }

    /**
     *
     */
    function removeAsk() external {
        require(
            memberInfo[msg.sender].enabled,
            "WQInsurance: Member not found"
        );
        require(asks[msg.sender].active, "WQInsurance: Ask is already revoked");
        require(
            !asks[msg.sender].executed,
            "WQInsurance: Payment is already executed"
        );
        asks[msg.sender].active = false;
        emit AskRevoked(block.timestamp, msg.sender);
    }

    /**
     *
     */
    function confirmPayment(address member) external {
        require(memberInfo[member].enabled, "WQInsurance: Member not found");
        require(
            memberInfo[msg.sender].enabled,
            "WQInsurance: You are not a member"
        );
        require(
            !confirmations[member][msg.sender],
            "WQInsurance: Payment is already confirmed"
        );
        asks[member].numConfirm++;
        confirmations[member][msg.sender] = true;
        emit PaymentConfirmed(block.timestamp, member, msg.sender);
    }

    /**
     *
     */
    function revokeConfirmation(address member) external {
        require(memberInfo[member].enabled, "WQInsurance: Member not found");
        require(
            memberInfo[msg.sender].enabled,
            "WQInsurance: You are not a member"
        );
        require(
            confirmations[member][msg.sender],
            "WQInsurance: Payment is already revoked confirmation"
        );
        asks[member].numConfirm--;
        confirmations[member][msg.sender] = false;
        emit ConfirmationRevoked(block.timestamp, member, msg.sender);
    }

    /**
     *
     */
    function executePayment() external {
        require(
            memberInfo[msg.sender].enabled,
            "WQInsurance: You are not a member"
        );
        require(
            memberInfo[msg.sender].lastContribution +
                contributionPeriod +
                7 days >
                block.timestamp,
            "WQInsurance: Your insurance is paused"
        );
        require(asks[msg.sender].active, "WQInsurance: Payment is not asked");
        require(
            !asks[msg.sender].executed,
            "WQInsurance: Payment is already executed"
        );
        require(
            asks[msg.sender].numConfirm == MAX_MEMBERS,
            "WQInsurance: Payment is not confirmed"
        );
        asks[msg.sender].executed = true;
        payable(msg.sender).transfer(asks[msg.sender].asked);
        emit PaymentExecuted(
            block.timestamp,
            asks[msg.sender].asked,
            msg.sender
        );
    }
}
