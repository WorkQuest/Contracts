// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import './WQTInterface.sol';
import './WQDAOVault.sol';

contract WQDAOVoting is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using AddressUpgradeable for address payable;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant CHAIRPERSON_ROLE = keccak256('CHAIRPERSON_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    /// @notice Checkpoint structure
    struct Checkpoint {
        uint32 fromBlock;
        uint224 votes;
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

    struct Proposal {
        //Unique id for looking up a proposal
        uint256 id;
        uint256 nonce;
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
        bool succeded;
        bool defeated;
    }

    struct ProposalInfo {
        uint256 id;
        uint256 nonce;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 numVoters;
        uint256 startTime;
        uint256 expireTime;
        uint256 blockNumber;
        address proposer;
        bool active;
        string description;
        bool succeded;
        bool defeated;
    }

    struct ProposalPages {
        uint256 count;
        uint256 offset;
        uint256 limit;
        ProposalInfo[] pages;
    }

    /// @dev Minimum quorum of voters for for making a decision
    uint256 public minimumQuorum;

    /// @dev The duration of voting on a proposal, in seconds
    uint256 public votingPeriod;

    // Minimum quantity of tokens for proposals
    uint256 public proposalThreshold;

    // Minimum quantity of tokens for voting
    uint256 public voteThreshold;

    // The total number of proposals
    uint256 public proposalCount;

    address payable public feeReceiver;

    uint256 public fee;

    //The record of all proposals ever proposed
    mapping(uint256 => Proposal) public proposals;

    mapping(address => address) private _delegates;

    mapping(address => Checkpoint[]) private _checkpoints;

    mapping(address => uint256) private _frozed;

    mapping(address => WQDAOVault) private _vaults;

    /**
     * @notice Emitted when an account changes their delegate.
     */
    event DelegateChanged(
        address indexed delegator,
        address indexed fromDelegate,
        address indexed toDelegate
    );

    /**
     * @notice Emitted when a token transfer or delegate change results in changes to an account's voting power.
     */
    event DelegateVotesChanged(
        address indexed delegator,
        address indexed delegatee,
        uint256 previousBalance,
        uint256 newBalance
    );

    /// @notice An event emitted when a new proposal is created
    event ProposalCreated(
        uint256 id,
        uint256 nonce,
        address proposer,
        string description,
        uint256 votingPeriod,
        uint256 minimumQuorum,
        uint256 timestamp
    );

    /// @notice An event emitted when a vote has been cast on a proposal
    event VoteCast(
        address indexed voter,
        uint256 proposalId,
        bool support,
        uint256 votes,
        uint256 timestamp
    );

    /// @notice An event emitted when a proposal has been executed in the Timelock
    event ProposalExecuted(uint256 id, bool succeded, bool defeated);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice Initializes the contract
     * @param chairPerson Chairperson address
     * @param _minimumQuorum Minimum quorum of voters for for making a decision
     * @param _votingPeriod The duration of voting on a proposal, in seconds
     */
    function initialize(
        address chairPerson,
        uint256 _minimumQuorum,
        uint256 _votingPeriod,
        uint256 _proposalThreshold,
        uint256 _voteThreshold,
        uint256 _fee
    ) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setupRole(CHAIRPERSON_ROLE, chairPerson);
        _setRoleAdmin(CHAIRPERSON_ROLE, ADMIN_ROLE);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        minimumQuorum = _minimumQuorum;
        votingPeriod = _votingPeriod;
        proposalThreshold = _proposalThreshold;
        voteThreshold = _voteThreshold;
        fee = _fee;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @notice Function used to propose a new proposal. Sender must have delegates above the proposal threshold
     * @param _description String description of the proposal
     */
    function addProposal(uint256 nonce, string memory _description) external {
        require(
            getPastVotes(msg.sender, block.number - 1) >= proposalThreshold,
            'WQDAO: Proposer votes below proposal threshold'
        );

        Proposal storage proposal = proposals[proposalCount++];
        proposal.id = proposalCount - 1;
        proposal.nonce = nonce;
        proposal.proposer = msg.sender;
        proposal.numVoters = 0;
        proposal.forVotes = 0;
        proposal.againstVotes = 0;
        proposal.active = true;
        proposal.startTime = block.timestamp;
        proposal.expireTime = block.timestamp + votingPeriod;
        proposal.blockNumber = block.number;
        proposal.description = _description;
        proposal.succeded = false;
        proposal.defeated = false;

        emit ProposalCreated(
            proposalCount - 1,
            nonce,
            msg.sender,
            _description,
            votingPeriod,
            minimumQuorum,
            block.timestamp
        );
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
            page.pages[i] = ProposalInfo({
                id: proposals[offset + i].id,
                nonce: proposals[offset + i].nonce,
                proposer: proposals[offset + i].proposer,
                forVotes: proposals[offset + i].forVotes,
                againstVotes: proposals[offset + i].againstVotes,
                numVoters: proposals[offset + i].numVoters,
                startTime: proposals[offset + i].startTime,
                expireTime: proposals[offset + i].expireTime,
                blockNumber: proposals[offset + i].blockNumber,
                active: proposals[offset + i].active,
                description: proposals[offset + i].description,
                succeded: proposals[offset + i].succeded,
                defeated: proposals[offset + i].defeated
            });
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
        require(_proposalId < proposalCount, 'WQDAO: Invalid proposal id');
        if (proposals[_proposalId].active) return 2;
        else return proposals[_proposalId].succeded ? 1 : 0;
    }

    /**
     * @notice Calculates result of a proposal
     * @param _proposalId The id of the proposal
     */
    function calcState(uint256 _proposalId) internal {
        Proposal storage proposal = proposals[_proposalId];
        if (
            proposal.forVotes > proposal.againstVotes &&
            proposal.numVoters >= minimumQuorum
        ) {
            proposal.succeded = true;
        } else proposal.defeated = true;
    }

    /**
     * @notice Cast a vote for a proposal with a reason
     * @param _proposalId The id of the proposal to vote on
     * @param _support The support value for the vote
     */
    function doVote(uint256 _proposalId, bool _support) public payable {
        emit VoteCast(
            msg.sender,
            _proposalId,
            _support,
            castVoteInternal(msg.sender, _proposalId, _support),
            block.timestamp
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
        require(_proposalId < proposalCount, 'WQDAO: Invalid proposal id');
        Proposal storage proposal = proposals[_proposalId];
        uint256 votes = getPastVotes(_voter, proposal.blockNumber);
        require(
            votes >= voteThreshold,
            'WQDAO: Voter votes below vote threshold'
        );
        Receipt storage receipt = proposal.receipts[_voter];
        require(proposal.active == true, 'WQDAO: Voting is closed');
        require(receipt.hasVoted == false, 'WQDAO: Voter has already voted');
        require(
            block.timestamp < proposal.expireTime,
            'WQDAO: Proposal expired'
        );
        require(
            msg.value == (votes * fee) / 1e18,
            'WQDAO: Insufficient value of fee'
        );

        if (_support) {
            proposal.forVotes += votes;
        } else {
            proposal.againstVotes += votes;
        }

        proposal.numVoters++;

        receipt.hasVoted = true;
        receipt.support = _support;
        receipt.votes = votes;
        feeReceiver.sendValue(msg.value);
        return votes;
    }

    /**
     * @notice Calc voting state
     * @param _proposalId Proposal ID
     */
    function executeVoting(uint256 _proposalId)
        public
        onlyRole(CHAIRPERSON_ROLE)
    {
        require(_proposalId < proposalCount, 'WQDAO: Invalid proposal id');
        Proposal storage proposal = proposals[_proposalId];
        require(
            block.timestamp >= proposal.expireTime,
            'WQDAO: Voting is not expired yet'
        );
        require(proposal.active == true, 'WQDAO: Voting is closed');
        proposal.active = false;
        calcState(_proposalId);
        emit ProposalExecuted(
            _proposalId,
            proposal.succeded,
            proposal.defeated
        );
    }

    /**
     * @notice Reject voting
     * @param _proposalId Proposal ID
     */
    function rejectVoting(uint256 _proposalId)
        public
        onlyRole(CHAIRPERSON_ROLE)
    {
        require(_proposalId < proposalCount, 'WQDAO: Invalid proposal id');
        require(
            proposals[_proposalId].active == true,
            'WQDAO: Voting is closed'
        );
        proposals[_proposalId].active = false;
        proposals[_proposalId].succeded = false;
        proposals[_proposalId].defeated = true;
        emit ProposalExecuted(_proposalId, false, true);
    }

    /**
     * @notice DAO Voting functions
     */

    /**
     * @notice Returns the amount of locked tokens
     */
    function frozed(address account) public view returns (uint256) {
        return _frozed[account];
    }

    /**
     * @notice Get the `pos`-th checkpoint for `account`.
     */
    function checkpoints(address account, uint32 pos)
        public
        view
        returns (Checkpoint memory)
    {
        return _checkpoints[account][pos];
    }

    /**
     * @notice Get number of checkpoints for `account`.
     */
    function numCheckpoints(address account) public view returns (uint32) {
        return SafeCastUpgradeable.toUint32(_checkpoints[account].length);
    }

    /**
     * @notice Get the address `account` is currently delegating to.
     */
    function delegates(address account) public view returns (address) {
        return _delegates[account];
    }

    /**
     * @notice Gets the current votes balance for `account`
     */
    function getVotes(address[] calldata accounts)
        public
        view
        returns (uint256[] memory _delegatee)
    {
        _delegatee = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            uint256 pos = _checkpoints[accounts[i]].length;
            _delegatee[i] = pos == 0
                ? 0
                : _checkpoints[accounts[i]][pos - 1].votes;
        }
        return _delegatee;
    }

    /**
     * @notice Retrieve the number of votes for `account` at the end of `blockNumber`.
     * Requirements:
     * - `blockNumber` must have been already mined
     */
    function getPastVotes(address account, uint256 blockNumber)
        public
        view
        returns (uint256)
    {
        require(blockNumber < block.number, 'WQDAO: block not yet mined');
        return _checkpointsLookup(_checkpoints[account], blockNumber);
    }

    /**
     * @notice Delegate votes from the sender to `delegatee`.
     */
    function delegate(address delegatee) public payable {
        return _delegate(msg.sender, delegatee, msg.value);
    }

    /**
     * @dev Change delegation for `delegator` to `delegatee`.
     */
    function _delegate(
        address delegator,
        address delegatee,
        uint256 amount
    ) internal {
        require(
            delegator != address(0),
            "WQDAO: Cant't delegate from the zero address"
        );
        require(
            delegatee != address(0),
            "WQDAO: Cant't delegate to the zero address"
        );
        if (_vaults[delegator] == WQDAOVault(payable(0))) {
            _vaults[delegator] = new WQDAOVault(payable(msg.sender));
        }
        if (_frozed[delegator] > 0) {
            _vaults[delegator].transfer(_frozed[delegator]);
        }
        payable(_vaults[delegator]).sendValue(amount);
        emit DelegateChanged(delegator, _delegates[delegator], delegatee);
        _moveVotingPower(_delegates[delegator], address(0), _frozed[delegator]);
        _moveVotingPower(address(0), delegatee, amount);
        _frozed[delegator] = amount;
        _delegates[delegator] = delegatee;
    }

    function undelegate() public {
        _undelegate(msg.sender);
    }

    function vault(address delegator) external view returns (WQDAOVault) {
        return _vaults[delegator];
    }

    function _undelegate(address delegator) internal {
        emit DelegateChanged(delegator, _delegates[delegator], address(0));
        _moveVotingPower(_delegates[delegator], address(0), _frozed[delegator]);
        if (_frozed[delegator] > 0) {
            _vaults[delegator].transfer(_frozed[delegator]);
        }
        _frozed[delegator] = 0;
        delete _delegates[msg.sender];
    }

    function _moveVotingPower(
        address src,
        address dst,
        uint256 amount
    ) private {
        if (src != dst && amount > 0) {
            if (src != address(0)) {
                (uint256 oldWeight, uint256 newWeight) = _writeCheckpoint(
                    _checkpoints[src],
                    _subtract,
                    amount
                );
                emit DelegateVotesChanged(
                    msg.sender,
                    src,
                    oldWeight,
                    newWeight
                );
            }

            if (dst != address(0)) {
                (uint256 oldWeight, uint256 newWeight) = _writeCheckpoint(
                    _checkpoints[dst],
                    _add,
                    amount
                );
                emit DelegateVotesChanged(
                    msg.sender,
                    dst,
                    oldWeight,
                    newWeight
                );
            }
        }
    }

    /**
     * @dev Lookup a value in a list of (sorted) checkpoints.
     */
    function _checkpointsLookup(Checkpoint[] storage ckpts, uint256 blockNumber)
        private
        view
        returns (uint256)
    {
        uint256 high = ckpts.length;
        uint256 low = 0;
        while (low < high) {
            uint256 mid = MathUpgradeable.average(low, high);
            if (ckpts[mid].fromBlock > blockNumber) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        return high == 0 ? 0 : ckpts[high - 1].votes;
    }

    function _writeCheckpoint(
        Checkpoint[] storage ckpts,
        function(uint256, uint256) view returns (uint256) op,
        uint256 delta
    ) private returns (uint256 oldWeight, uint256 newWeight) {
        uint256 pos = ckpts.length;
        oldWeight = pos == 0 ? 0 : ckpts[pos - 1].votes;
        newWeight = op(oldWeight, delta);

        if (pos > 0 && ckpts[pos - 1].fromBlock == block.number) {
            ckpts[pos - 1].votes = SafeCastUpgradeable.toUint224(newWeight);
        } else {
            ckpts.push(
                Checkpoint({
                    fromBlock: SafeCastUpgradeable.toUint32(block.number),
                    votes: SafeCastUpgradeable.toUint224(newWeight)
                })
            );
        }
    }

    function _add(uint256 a, uint256 b) private pure returns (uint256) {
        return a + b;
    }

    function _subtract(uint256 a, uint256 b) private pure returns (uint256) {
        return a - b;
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

    function setFee(uint256 _fee) external onlyRole(ADMIN_ROLE) {
        fee = _fee;
    }
}
