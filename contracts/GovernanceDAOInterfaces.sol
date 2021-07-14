//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

interface IDAO {
    enum checkVote {notVote, voted, delegated}

    struct Proposal {
        // proposal may execute only after voting ended
        uint256 endTimeOfVoting;
        //  voting is over
        bool votingIsOver;
        // voting result
        bool executSuccessfully;
        // number of votes already voted
        uint256 numberOfVotes;
        // in support of votes
        uint256 votesSupport;
        // against votes
        uint256 votesAgainst;
        // a plain text description of the proposal
        string desc;
        bytes transactionByteCode;
        address recipient;
        //index - index proposal
        uint256 index;
    }

    event ProposalAdded(
        uint256 proposalID,
        uint256 endTimeOfVoting,
        string description
    );
    event Finish(
        uint256 index,
        bool executSuccessfully,
        uint256 votesSupport,
        uint256 votesAgainst
    );

    event Vote(
        address owner,
        uint256 index,
        bool SupportAgainst,
        uint256 amount
    );
    event Delegate(address owner, address delegatee, uint256 index);

    /**
     *   @dev changeVotingRules - change voting rules
     *   Parameters:
     *   _minimumQuorum - how many members must vote on a proposal for it to be executed
     *   _requisiteMajority -
     *   _debatingPeriodDuration -
     */

    function changeVotingRules(
        uint256 _minimumQuorum,
        uint256 _debatingPeriodDuration,
        uint256 _requisiteMajority
    ) external;

    /**
     *   @dev addPropasal - add a proposal to vote
     */
    function addProposal(
        address recipient,
        string memory description,
        bytes memory transactionByteCode
    ) external;

    /**
     *   @dev - getInfoProposal
     *   Parameters:
     *   index - index proposal
     */
    function getInfoProposal(uint256 index)
        external
        view
        returns (Proposal memory);

    /**
    @dev delegate - delegate tokens to another address for a specific vote
    *   delegatee - the address to which you delegate votes
    *   index - index proposal
    */
    function delegate(address delegatee, uint256 index) external;

    /**
    @dev redelegate - redelegate tokens to another address for a specific vote
    *   oldDelegatee - the address to which you delegate votes
    *   newDelegatee - 
    *   index - index proposal
    */
    function reDelegate(
        address oldDelegatee,
        address newDelegatee,
        uint256 index
    ) external;

    /**
     *   @dev vote
     *   index - index proposal
     *   SupportAgainst - vote for or against
     *
     */
    function vote(uint256 index, bool SupportAgainst) external;

    /**
     *  @dev finishVote - call after the end, displays the result of the vote
     *   index - index proposal
     */
    function finishVote(uint256 index) external;
}