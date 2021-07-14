// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./GovernanceDAOInterfaces.sol";

contract DAO is IDAO, AccessControl {
    using SafeMath for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CHAIRPERSON_ROLE = keccak256("CHAIRPERSON_ROLE");

    IERC20 public voteToken;

    // address contract
    address votersToken;
    // minimum quorum - number of votes must be more than minimum quorum
    uint256 public minimumQuorum;
    // requisite majority of votes
    uint256 public requisiteMajority;
    // debating period duration
    uint256 public debatingPeriodDuration;

    uint256 count = 0;

    mapping(uint256 => Proposal) public Proposals;
    mapping(uint256 => mapping(address => checkVote)) checkVoting;
    mapping(address => mapping(uint256 => address[])) public delegates;

    modifier onlyChairPerson {
        require(
            hasRole(CHAIRPERSON_ROLE, msg.sender),
            "Caller is not a chairperson"
        );
        _;
    }

    constructor(
        address chairPerson,
        address _voteToken,
        uint256 _requisiteMajority,
        uint256 _minimumQuorum,
        uint256 _debatingPeriodDuration
    ) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(CHAIRPERSON_ROLE, chairPerson);
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        voteToken = ERC20(_voteToken);
        requisiteMajority = _requisiteMajority;
        minimumQuorum = _minimumQuorum;
        debatingPeriodDuration = _debatingPeriodDuration;
    }

    function changeVotingRules(
        uint256 _minimumQuorum,
        uint256 _debatingPeriodDuration,
        uint256 _requisiteMajority
    ) external override onlyChairPerson {
        minimumQuorum = _minimumQuorum;
        requisiteMajority = _requisiteMajority;
        debatingPeriodDuration = _debatingPeriodDuration;
    }

    function checkVotingRules()
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        return (minimumQuorum, requisiteMajority, debatingPeriodDuration);
    }

    function addProposal(
        address _recipient,
        string memory description,
        bytes memory _transactionByteCode
    ) external override {
        count++;
        Proposal memory proposal =
            Proposal({
                endTimeOfVoting: block.timestamp + debatingPeriodDuration,
                votingIsOver: false,
                executSuccessfully: false,
                numberOfVotes: 0,
                votesSupport: 0,
                votesAgainst: 0,
                desc: description,
                transactionByteCode: _transactionByteCode,
                recipient: _recipient,
                index: count
            });
        Proposals[count] = proposal;

        emit ProposalAdded(count, proposal.endTimeOfVoting, proposal.desc);
    }

    function getInfoProposal(uint256 index)
        external
        view
        override
        returns (Proposal memory)
    {
        return Proposals[index];
    }

    function delegate(address delegatee, uint256 index) public override {
        require(
            (checkVoting[index][msg.sender] == checkVote.notVote &&
                checkVoting[index][delegatee] != checkVote.voted),
            "DAO: you have already voted"
        );
        delegates[delegatee][index].push(msg.sender);
        checkVoting[index][msg.sender] = checkVote.delegated;

        emit Delegate(msg.sender, delegatee, index);
    }

    function reDelegate(
        address oldDelegatee,
        address newDelegatee,
        uint256 index
    ) public override {
        require(
            checkVoting[index][oldDelegatee] != checkVote.voted,
            "DAO: you have already voted"
        );
        address[] storage addr = delegates[oldDelegatee][index];
        for (uint256 i; i < addr.length; i++) {
            if (addr[i] == msg.sender) {
                addr[i] = addr[addr.length - 1];
                addr.pop();
                checkVoting[index][msg.sender] = checkVote.notVote;
            }
        }
        if (msg.sender != newDelegatee) {
            delegate(newDelegatee, index);
        } else {
            emit Delegate(msg.sender, newDelegatee, index);
        }
    }

    function vote(uint256 index, bool SupportAgainst) external override {
        require(
            checkVoting[index][msg.sender] == checkVote.notVote,
            "DAO: you have already voted"
        );
        require(Proposals[index].votingIsOver == false, "DAO: voting ended");

        address[] memory delegatesArray = delegates[msg.sender][index];
        uint256 allAmount = voteToken.balanceOf(msg.sender);
        for (uint256 i; i < delegatesArray.length; i++) {
            uint256 amount = voteToken.balanceOf(delegatesArray[i]);
            allAmount = amount.add(amount);
            checkVoting[index][delegatesArray[i]] = checkVote.voted;
        }
        Proposal storage proposal = Proposals[index];
        proposal.numberOfVotes += allAmount;

        SupportAgainst == true
            ? proposal.votesSupport = proposal.votesSupport.add(allAmount)
            : proposal.votesAgainst = proposal.votesAgainst.add(allAmount);

        checkVoting[index][msg.sender] = checkVote.voted;
        emit Vote(msg.sender, index, SupportAgainst, allAmount);
    }

    function finishVote(uint256 index) external override {
        Proposal storage proposal = Proposals[index];
        require(
            proposal.votingIsOver == false,
            "DAO: the result of the vote has already been completed"
        );
        require(proposal.endTimeOfVoting < block.timestamp, "DAO: voting is not over yet");

        proposal.votingIsOver = true;

        if (proposal.numberOfVotes > minimumQuorum) {
            if (proposal.votesSupport > requisiteMajority) {
                (bool success, ) =
                    proposal.recipient.call{value: 0}(proposal.transactionByteCode);
                proposal.executSuccessfully = success;
                require(success,'ERROR call func');
            }
        }
        emit Finish(
            index,
            proposal.executSuccessfully,
            proposal.votesSupport,
            proposal.votesAgainst
        );
    }
}