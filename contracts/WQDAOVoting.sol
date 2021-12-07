// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';

import './WQTInterface.sol';

contract WQDAOVoting is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    string public constant name = 'WorkQuest DAO Voting';

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant CHAIRPERSON_ROLE = keccak256('CHAIRPERSON_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    struct Proposal {
        //Unique id for looking up a proposal
        uint256 id;
        //Creator of the proposal
        address proposer;
        // Current number of votes in favor of this proposal
        uint256 forVotes;
        // Current number of votes in opposition to this proposal
        uint256 againstVotes;
        // Current number of voters in this proposal
        uint256 numVoters;
        // Start time of proposal
        uint256 startTime;
        // Expire time of proposal
        uint256 expireTime;
        // Block number, when proposal created
        uint256 blockNumber;
        // Flag marking whether the proposal is active
        bool active;
        string description;
        // Receipts of ballots for the entire set of voters
        mapping(address => Receipt) receipts;
    }

    /// @notice Ballot receipt record for a voter
    struct Receipt {
        // Whether or not a vote has been cast
        bool hasVoted;
        // Whether or not the voter supports the proposal or abstains
        bool support;
        // The number of votes the voter had, which were cast
        uint256 votes;
    }

    struct VoteResult {
        bool succeded;
        bool defeated;
    }

    struct ProposalInfo {
        uint256 id;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 numVoters;
        uint256 startTime;
        uint256 expireTime;
        uint256 blockNumber;
        address proposer;
        bool active;
        string description;
    }

    struct ProposalPages {
        uint256 count;
        uint256 offset;
        uint256 limit;
        ProposalInfo[] pages;
    }

    /// @dev The address of the governance token
    WQTInterface public token;

    /// @dev minimum quorum of voters for for making a decision
    uint256 public minimumQuorum;

    /// @dev The duration of voting on a proposal, in seconds
    uint256 public votingPeriod;

    // Minimum quantity of tokens for proposals
    uint256 public proposalThreshold;

    // Minimum quantity of tokens for voting
    uint256 public voteThreshold;

    // The total number of proposals
    uint256 public proposalCount;

    //The record of all proposals ever proposed
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => VoteResult) public voteResults;

    /// @notice An event emitted when a new proposal is created
    event ProposalCreated(
        uint256 id,
        address proposer,
        string description,
        uint256 votingPeriod,
        uint256 minimumQuorum
    );

    /// @notice An event emitted when a vote has been cast on a proposal
    event VoteCast(
        address indexed voter,
        uint256 proposalId,
        bool support,
        uint256 votes
    );

    /// @notice An event emitted when a proposal has been executed in the Timelock
    event ProposalExecuted(uint256 id);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice Initializes the contract
     * @param chairPerson Chairperson address
     * @param _voteToken The address of the DAO token
     */
    function initialize(
        address chairPerson,
        address _voteToken,
        uint256 _minimumQuorum,
        uint256 _votingPeriod
    ) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setupRole(CHAIRPERSON_ROLE, chairPerson);
        _setRoleAdmin(CHAIRPERSON_ROLE, ADMIN_ROLE);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        token = WQTInterface(_voteToken);
        minimumQuorum = _minimumQuorum;
        votingPeriod = _votingPeriod;
        proposalThreshold = 10000e18; //10,000
        voteThreshold = 100e18; //100
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @notice Function used to propose a new proposal. Sender must have delegates above the proposal threshold
     * @param _description String description of the proposal
     
     * @return Proposal id of new proposal
     */
    function addProposal(string memory _description) public returns (uint256) {
        require(
            token.getVotes(msg.sender) >= proposalThreshold,
            'Proposer votes below proposal threshold'
        );

        Proposal storage proposal = proposals[proposalCount++];

        proposal.id = proposalCount - 1;
        proposal.proposer = msg.sender;
        proposal.numVoters = 0;
        proposal.forVotes = 0;
        proposal.againstVotes = 0;
        proposal.active = true;
        proposal.startTime = block.timestamp;
        proposal.expireTime = block.timestamp + votingPeriod;
        proposal.blockNumber = block.number;
        proposal.description = _description;

        emit ProposalCreated(
            proposal.id,
            msg.sender,
            _description,
            votingPeriod,
            minimumQuorum
        );
        return proposal.id;
    }

    /**
     * @dev Get information about proposal
     */

    function getProposals(uint256 offset, uint256 limit)
        external
        view
        returns (ProposalPages memory page)
    {
        page.count = proposalCount;
        page.offset = offset;
        if (limit > proposalCount - offset) {
            limit = proposalCount - offset;
        }
        page.limit = limit;
        page.pages = new ProposalInfo[](limit);
        for (uint256 i = 0; i < limit; i++) {
            page.pages[i].id = proposals[offset + i].id;
            page.pages[i].proposer = proposals[offset + i].proposer;
            page.pages[i].forVotes = proposals[offset + i].forVotes;
            page.pages[i].againstVotes = proposals[offset + i].againstVotes;
            page.pages[i].numVoters = proposals[offset + i].numVoters;
            page.pages[i].startTime = proposals[offset + i].startTime;
            page.pages[i].expireTime = proposals[offset + i].expireTime;
            page.pages[i].blockNumber = proposals[offset + i].blockNumber;
            page.pages[i].active = proposals[offset + i].active;
            page.pages[i].description = proposals[offset + i].description;
        }
        return page;
    }

    /**
     * @notice Gets the receipt for a voter on a given proposal
     * @param _proposalId the id of proposal
     * @param _voter The address of the voter
     * @return The voting receipt
     */
    function getReceipt(uint256 _proposalId, address _voter)
        external
        view
        returns (Receipt memory)
    {
        return proposals[_proposalId].receipts[_voter];
    }

    /**
     * @notice Gets the state of a proposal
     * @param _proposalId The id of the proposal
     * @return proposalState - state of proposal: 2 - active; 0 - defeat; 1- win
     */
    function state(uint256 _proposalId)
        public
        view
        returns (uint8 proposalState)
    {
        require(_proposalId < proposalCount, 'Invalid proposal id');
        if (proposals[_proposalId].active) return 2;
        else return voteResults[_proposalId].succeded ? 1 : 0;
    }

    /**
     * @notice Calculates result of a proposal
     * @param _proposalId The id of the proposal
     */
    function calcState(uint256 _proposalId) internal {
        Proposal storage proposal = proposals[_proposalId];
        VoteResult storage result = voteResults[_proposalId];
        if (
            proposal.forVotes > proposal.againstVotes &&
            proposal.numVoters > minimumQuorum
        ) {
            result.succeded = true;
        } else result.defeated = true;
    }

    /**
     * @notice Cast a vote for a proposal with a reason
     * @param _proposalId The id of the proposal to vote on
     * @param _support The support value for the vote
     */
    function doVote(uint256 _proposalId, bool _support) public {
        emit VoteCast(
            msg.sender,
            _proposalId,
            _support,
            castVoteInternal(msg.sender, _proposalId, _support)
        );
    }

    /**
     * @notice Internal function that caries out voting logic
     * @param _voter The voter that is casting their vote
     * @param _proposalId The id of the proposal to vote on
     * @param _support The support value for the vote. 0=against, 1=for, 2=abstain
     * @return The number of votes cast
     */
    function castVoteInternal(
        address _voter,
        uint256 _proposalId,
        bool _support
    ) internal returns (uint256) {
        require(_proposalId < proposalCount, 'Invalid proposal id');
        Proposal storage proposal = proposals[_proposalId];
        uint256 votes = token.getPastVotes(_voter, proposal.blockNumber);
        require(votes >= voteThreshold, 'Voter votes below vote threshold');
        Receipt storage receipt = proposal.receipts[_voter];
        require(proposal.active == true, 'Voting is closed');
        require(receipt.hasVoted == false, 'Voter has already voted');
        require(block.timestamp < proposal.expireTime, 'Proposal expired');

        if (_support) {
            proposal.forVotes += votes;
        } else {
            proposal.againstVotes += votes;
        }

        proposal.numVoters++;

        receipt.hasVoted = true;
        receipt.support = _support;
        receipt.votes = votes;

        return votes;
    }

    /**
     *
     */
    function executeVoting(uint256 _proposalId)
        public
        onlyRole(CHAIRPERSON_ROLE)
    {
        require(_proposalId < proposalCount, 'Invalid proposal id');
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.active == true, 'Voting is closed');
        proposal.active = false;
        calcState(_proposalId);
        emit ProposalExecuted(_proposalId);
    }

    /**
     * @dev Change voting parameters
     * @param _minimumQuorum The initial number of members must vote on a proposal for it to be executed
     * @param _votingPeriod The initial voting period
     */
    function changeVotingRules(uint256 _minimumQuorum, uint256 _votingPeriod)
        external
        onlyRole(ADMIN_ROLE)
    {
        minimumQuorum = _minimumQuorum;
        votingPeriod = _votingPeriod;
    }

    function setProposalThreshold(uint256 amount)
        external
        onlyRole(ADMIN_ROLE)
    {
        proposalThreshold = amount;
    }

    function setVoteThreshold(uint256 amount) external onlyRole(ADMIN_ROLE) {
        voteThreshold = amount;
    }
}
