// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./WQTInterface.sol";

contract WQDAOVoting is AccessControl {
    string public constant name = "WorkQuest DAO Voting";

    /// @notice The EIP-712 typehash for the contract's domain
    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,uint256 chainId,address verifyingContract)"
        );

    /// @notice The EIP-712 typehash for the ballot struct used by the contract
    bytes32 public constant BALLOT_TYPEHASH =
        keccak256("Ballot(uint256 proposalId,uint8 support)");

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CHAIRPERSON_ROLE = keccak256("CHAIRPERSON_ROLE");

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
        // Expire time of proposal
        uint256 proposalExpireTime;
        // Flag marking whether the proposal is active
        bool active;
        address recipient;
        bytes byteCode;
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

    // Administrator for this contract
    address public admin;

    // The duration of voting on a proposal, in blocks
    uint256 public votingPeriod;

    uint256 public minimumQuorum;

    // The total number of proposals
    uint256 public proposalCount;

    // Minimum quantity of tokens for proposals
    uint256 public proposalThreshold = 10000e18; //10,000

    // Minimum quantity of tokens for voting
    uint256 public voteThreshold = 100e18; //100

    //The address of the governance token
    WQTInterface public token;

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
        uint256 votes,
        string reason
    );

    /// @notice An event emitted when a proposal has been executed in the Timelock
    event ProposalExecuted(uint256 id);

    /**
     * @notice Initializes the contract
     * @param chairPerson Chairperson address
     * @param _voteToken The address of the DAO token
     */
    constructor(address chairPerson, address _voteToken) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(CHAIRPERSON_ROLE, chairPerson);
        _setRoleAdmin(CHAIRPERSON_ROLE, ADMIN_ROLE);
        token = WQTInterface(_voteToken);
    }

    /**
     * @notice Function used to propose a new proposal. Sender must have delegates above the proposal threshold
     * @param _description String description of the proposal
     
     * @return Proposal id of new proposal
     */
    function addProposal(
        address _recipient,
        string memory _description,
        bytes memory _byteCode
    ) public returns (uint256) {
        require(
            token.balanceOf(msg.sender) > proposalThreshold,
            "Proposer votes below proposal threshold"
        );

        Proposal storage proposal = proposals[proposalCount++];

        proposal.id = proposalCount;
        proposal.proposer = msg.sender;
        proposal.numVoters = 0;
        proposal.forVotes = 0;
        proposal.againstVotes = 0;
        proposal.active = true;
        proposal.proposalExpireTime = block.timestamp + votingPeriod;
        proposal.recipient = _recipient;
        proposal.byteCode = _byteCode;
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
        require(proposalCount >= _proposalId, "Invalid proposal id");
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
            (result.succeded, ) = proposal.recipient.call{value: 0}(
                proposal.byteCode
            );
        } else result.defeated = true;
    }

    /**
     * @notice Cast a vote for a proposal with a reason
     * @param _proposalId The id of the proposal to vote on
     * @param _support The support value for the vote
     * @param _justification The reason given for the vote by the voter
     */
    function doVote(
        uint256 _proposalId,
        bool _support,
        string calldata _justification
    ) public {
        emit VoteCast(
            msg.sender,
            _proposalId,
            _support,
            castVoteInternal(msg.sender, _proposalId, _support),
            _justification
        );
    }

    /**
     * @notice Cast a vote for a proposal by signature
     * @dev External function that accepts EIP-712 signatures for voting on proposals.
     */
    function castVoteBySig(
        uint256 _proposalId,
        bool _support,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes(name)),
                block.chainid,
                address(this)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(BALLOT_TYPEHASH, _proposalId, _support)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );
        address signatory = ecrecover(digest, v, r, s);
        require(signatory != address(0), "Invalid signature");
        emit VoteCast(
            signatory,
            _proposalId,
            _support,
            castVoteInternal(signatory, _proposalId, _support),
            ""
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
        require(
            token.votePowerOf(msg.sender) > voteThreshold,
            "Voter votes below vote threshold"
        );
        require(proposalCount > _proposalId, "Invalid proposal id");
        Proposal storage proposal = proposals[_proposalId];
        Receipt storage receipt = proposal.receipts[_voter];
        require(proposal.active == true, "Voting is closed");
        require(receipt.hasVoted == false, "Voter has already voted");
        require(
            block.timestamp < proposal.proposalExpireTime,
            "Proposal expired"
        );
        uint256 votes = token.getVotes(_voter);

        if (_support) {
            proposal.forVotes = add256(proposal.forVotes, votes);
        } else {
            proposal.againstVotes = add256(proposal.againstVotes, votes);
        }

        proposal.numVoters++;

        receipt.hasVoted = true;
        receipt.support = _support;
        receipt.votes = votes;

        return votes;
    }

    function executeVoting(uint256 _proposalId) public {
        require(
            hasRole(CHAIRPERSON_ROLE, msg.sender),
            "Caller is not a chairperson"
        );
        require(proposalCount > _proposalId, "Invalid proposal id");
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.active == true, "Voting is closed");
        proposal.active = false;
        calcState(_proposalId);
        emit ProposalExecuted(_proposalId);
    }

    function add256(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "addition overflow");
        return c;
    }

    function sub256(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "subtraction underflow");
        return a - b;
    }

    /**
     * @param _minimumQuorum The initial number of members must vote on a proposal for it to be executed
     * @param _votingPeriod The initial voting period
     */
    function changeVotingRules(uint256 _minimumQuorum, uint256 _votingPeriod)
        external
    {
        require(hasRole(ADMIN_ROLE, msg.sender), "Caller is not an admin");
        minimumQuorum = _minimumQuorum;
        votingPeriod = _votingPeriod;
    }
}
