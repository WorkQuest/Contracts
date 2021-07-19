// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "./DAOVoteInterface.sol";
import "./WQTokenInterface.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract DAOBallot is DAODelegateStorage, DAOEvents, AccessControl {
    /**
     * @notice Initializes the contract
     * @param _voteToken The address of the DAO token
     */
    constructor(address chairPerson, address _voteToken) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(CHAIRPERSON_ROLE, chairPerson);
        token = WQTokenInterface(_voteToken);
    }

    /**
     * @notice Function used to propose a new proposal. Sender must have delegates above the proposal threshold
     * @param _description String description of the proposal
     * @param _votingPeriod The initial voting period
     * @param _minimumQuorum The initial number of members must vote on a proposal for it to be executed
     * @return Proposal id of new proposal
     */
    function addProposal(
        string memory _description,
        uint256 _votingPeriod,
        uint256 _minimumQuorum
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
        proposal.proposalExpireTime = block.timestamp + _votingPeriod;

        votingPeriod = _votingPeriod;
        minimumQuorum = _minimumQuorum;

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
            result.succeded = true;
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
                getChainIdInternal(),
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

    function getChainIdInternal() internal view returns (uint256) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return chainId;
    }
}