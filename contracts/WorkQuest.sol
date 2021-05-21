// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./PensionWalletFactory.sol";


contract WorkQuest is AccessControl {
    using SafeMath for uint256;

    event Received(address sender, uint256 _cost);

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    string constant errMsg = "WorkLabor: Access denied or invalid status";
    uint256 public fee;
    address payable public feeReceiver;
    PensionWalletFactory pension;

    /**
     * @dev Job offer statuses
     * @param New
     * @param Published
     * @param Assigned
     * @param InProcess
     * @param Verification
     * @param Rework
     * @param DecreasedCost
     * @param Arbitration
     * @param Accepted
     * @param Declined
     */

    enum JobStatus {
        New,
        Published,
        Assigned,
        InProcess,
        Verification,
        Rework,
        DecreasedCost,
        Arbitration,
        Accepted,
        Declined
    }

    /**
     * @dev Job offer information
     * @param _hash keccak256 hash of contract offer
     * @param cost
     * @param employer
     * @param worker
     * @param status
     * @param deadline Unix timestamp of deadline
     */
    struct JobOffer {
        uint256 _hash;
        uint256 cost;
        uint256 forfeit;
        address payable employer;
        address payable worker;
        JobStatus status;
        uint256 deadline;
    }

    /// @dev Mapping of _id to JobOffer
    mapping(uint256 => JobOffer) jobOffers;
    mapping(address => uint256) lastWork;

    constructor(uint256 _fee, address payable _feeReceiver) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        fee = _fee;
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Job status getter
     * @param _id Job ID
     */
    function getJobStatus(uint256 _id)
        public
        view
        returns (JobStatus status)
    {
        return jobOffers[_id].status;
    }

    /**
     * @notice Job cost and forfeit getter
     * @param _id Job ID
     */
    function getJobCostForfeit(uint256 _id)
        public
        view
        returns (uint256 cost, uint256 forfeit)
    {
        return (jobOffers[_id].cost, jobOffers[_id].forfeit);
    }

    /**
     * @notice Worker and employer addresses getter
     * @param _id Job ID
     */
    function getMemberAddresses(uint256 _id)
        public
        view
        returns (address employer, address worker)
    {
        return (jobOffers[_id].employer, jobOffers[_id].worker);
    }

    /**
     * @notice Job hash getter
     * @param _id Job ID
     */
    function getJobHash(uint256 _id) public view returns (uint256 _hash) {
        return jobOffers[_id]._hash;
    }

    /**
     * @notice Set fee
     * @param _fee Fee amount
     */
    function setFee(uint256 _fee) public {
        require(hasRole(ADMIN_ROLE, msg.sender), errMsg);
        fee = _fee;
    }

    /**
     * @notice Set fee receiver
     * @param _feeReceiver Address of fee receiver
     */
    function setFeeReceiver(address payable _feeReceiver) public {
        require(hasRole(ADMIN_ROLE, msg.sender), errMsg);
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Employer created new job
     * @param _id Job ID
     * @param _hash Job hash
     * @param _cost Job _cost
     */
    function newJob(
        uint256 _id,
        uint256 _hash,
        uint256 _cost
    ) public {
        require(
            lastWork[msg.sender] == 0,
            "WorkLabor: There is unpublished job"
        );
        JobOffer storage offer = jobOffers[_id];
        require(offer.status == JobStatus.New, errMsg);
        lastWork[msg.sender] = _id;
        offer.employer = msg.sender;
        offer._hash = _hash;
        offer.cost = _cost;
    }

    function cleanUnpublishJob(uint256 _id) public {
        require(jobOffers[_id].status == JobStatus.New, errMsg);
        require(msg.sender == jobOffers[_id].employer, errMsg);
        delete jobOffers[_id];
        lastWork[msg.sender] = 0;
    }

    /**
     * @notice Employer publish job by transfer funds to contract
     */
    receive() external payable {
        uint256 _id = lastWork[msg.sender];
        require(_id != 0, "WorkLabor: Employer don't have unpublished job");
        require(jobOffers[_id].status == JobStatus.New, errMsg);
        uint256 cost = jobOffers[_id].cost;
        uint256 comission = cost.mul(fee).div(1e18);
        cost = cost.add(comission);
        require(msg.value >= cost, "WorkLabor: Insuffience cost");
        jobOffers[_id].status = JobStatus.Published;
        lastWork[msg.sender] = 0;
        if (msg.value > cost) {
            msg.sender.transfer(msg.value.sub(cost));
        }
        feeReceiver.transfer(comission);
        emit Received(msg.sender, msg.value);
    }

    /**
     * @notice Employer assigned worker to job
     * @param _id Job ID
     * @param worker Workers wallet address
     */
    function assignJob(uint256 _id, address payable worker) public {
        JobOffer storage offer = jobOffers[_id];
        require(
            msg.sender == offer.employer && offer.status == JobStatus.Published,
            errMsg
        );
        require(worker != address(0), "WorkLabor: Invalid address");
        offer.status = JobStatus.Assigned;
        offer.worker = worker;
    }

    /**
     * @notice Worker process job
     * @param _id Job ID
     */
    function processJob(uint256 _id) public {
        JobOffer storage offer = jobOffers[_id];
        require(
            msg.sender == offer.worker &&
                (offer.status == JobStatus.Assigned ||
                    offer.status == JobStatus.Rework),
            errMsg
        );
        offer.status = JobStatus.InProcess;
    }

    /**
     * @notice Worker send job to verification
     * @param _id Job ID
     */
    function verificationJob(uint256 _id) public {
        JobOffer storage offer = jobOffers[_id];
        require(
            msg.sender == offer.worker && offer.status == JobStatus.InProcess,
            errMsg
        );
        offer.status = JobStatus.Verification;
    }

    /**
     * @notice Employer decreased jobs cost
     * @param _id Job ID
     */
    function decreaseCostJob(uint256 _id, uint256 forfeit) public {
        JobOffer storage offer = jobOffers[_id];
        require(
            (msg.sender == offer.employer &&
                (offer.status == JobStatus.Verification ||
                    offer.status == JobStatus.DecreasedCost)) ||
                (hasRole(ARBITER_ROLE, msg.sender) &&
                    offer.status == JobStatus.Arbitration),
            errMsg
        );
        require(
            forfeit <= offer.cost,
            "WorkLabor: forfeit must be least or equal job cost"
        );
        offer.status = JobStatus.DecreasedCost;
        offer.forfeit = forfeit;
    }

    /**
     * @notice Employer or arbiter send job to rework
     * @param _id Job ID
     */
    function reworkJob(uint256 _id) public {
        JobOffer storage offer = jobOffers[_id];
        require(
            (msg.sender == offer.employer &&
                offer.status == JobStatus.Verification) ||
                (hasRole(ARBITER_ROLE, msg.sender) &&
                    offer.status == JobStatus.Arbitration),
            errMsg
        );
        offer.status = JobStatus.Rework;
    }

    /**
     * @notice Employer or worker send job to arbitration
     * @param _id Job ID
     */
    function arbitrationJob(uint256 _id) public {
        JobOffer storage offer = jobOffers[_id];
        require(
            (msg.sender == offer.employer &&
                offer.status == JobStatus.Verification) ||
                (msg.sender == offer.worker &&
                    (offer.status == JobStatus.Rework ||
                        offer.status == JobStatus.DecreasedCost)),
            errMsg
        );
        offer.status = JobStatus.Arbitration;
    }

    /**
     * @notice Employer accepted job
     * @param _id Job ID
     */
    function acceptJob(uint256 _id) public {
        JobOffer storage offer = jobOffers[_id];
        require(
            (msg.sender == offer.employer &&
                offer.status == JobStatus.Verification) ||
                (msg.sender == offer.worker &&
                    offer.status == JobStatus.DecreasedCost) ||
                (hasRole(ARBITER_ROLE, msg.sender) &&
                    offer.status == JobStatus.Arbitration),
            errMsg
        );
        offer.status = JobStatus.Accepted;
        //comission = (cost - forfeit)*fee
        //reward = cost - forfeit - comission
        uint256 cost = offer.cost.sub(offer.forfeit);
        uint256 comission = cost.mul(fee).div(1e18);
        offer.worker.transfer(cost.sub(comission).sub(pensionFee));
        address[] wallets = pension.getWallets(offer.worker);

        if (offer.forfeit > 0) {
            offer.employer.transfer(offer.forfeit);
        }
        feeReceiver.transfer(comission);
    }

    /**
     * @notice Arbiter declined job
     * @param _id Job ID
     */
    function declineJob(uint256 _id) public {
        JobOffer storage offer = jobOffers[_id];
        require(
            hasRole(ARBITER_ROLE, msg.sender) &&
                offer.status == JobStatus.Arbitration,
            errMsg
        );
        offer.status = JobStatus.Declined;
        uint256 comission = offer.cost.mul(fee).div(1e18);
        offer.employer.transfer(offer.cost.sub(comission));
        feeReceiver.transfer(comission);
    }
}
