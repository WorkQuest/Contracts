// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

contract DAOEvents {
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
}

/**
 * @title Storage for DAO

 */
contract DAODelegateStorage {
    // The maximum setable proposal threshold
    uint256 public constant proposalThreshold = 10000e18; //10,000

    string public constant name = "DAO Ballot";

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

    // Administrator for this contract
    address public admin;

    // The duration of voting on a proposal, in blocks
    uint256 public votingPeriod;

    uint256 public minimumQuorum;

    // The total number of proposals
    uint256 public proposalCount;

    //The address of the Compound governance token
    TokenInterface public token;

    //TODO
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

    //The record of all proposals ever proposed
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => VoteResult) public voteResults;
}

interface TokenInterface {
    function getPastVotes(address account, uint256 blockNumber)
        external
        view
        returns (uint256);

    function getVotes(address account)
        external
        view
        returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address recipient, uint256 amount)
        external
        returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}