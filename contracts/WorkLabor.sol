// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract WorkLabor is AccessControl {
    using SafeMath for uint256;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    string constant errMsg = "WorkLabor: Access denied or invalid status";
    uint256 public fee;
    address public feeReceiver;

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
     * @param jobHash keccak256 hash of contract offer
     * @param cost
     * @param currency
     * @param employer
     * @param worker
     * @param status
     * @param deadline Unix timestamp of deadline
     */
    struct JobOffer {
        uint256 jobHash;
        uint256 cost;
        uint256 forfeit;
        IERC20 currency;
        address employer;
        address worker;
        JobStatus status;
        uint256 deadline;
    }

    /// @dev Mapping of jobId to JobOffer
    mapping(uint256 => JobOffer) jobOffers;

    constructor(uint256 _fee, address _feeReceiver) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        fee = _fee;
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Job status getter
     * @param jobId Job ID
     */
    function getJobStatus(uint256 jobId)
        public
        view
        returns (JobStatus status)
    {
        return jobOffers[jobId].status;
    }

    /**
     * @notice Job cost and forfeit getter
     * @param jobId Job ID
     */
    function getJobCostForfeit(uint256 jobId)
        public
        view
        returns (
            uint256 cost,
            uint256 forfeit,
            IERC20 currency
        )
    {
        return (
            jobOffers[jobId].cost,
            jobOffers[jobId].forfeit,
            jobOffers[jobId].currency
        );
    }

    /**
     * @notice Worker and employer addresses getter
     * @param jobId Job ID
     */
    function getMemberAddresses(uint256 jobId)
        public
        view
        returns (address employer, address worker)
    {
        return (jobOffers[jobId].employer, jobOffers[jobId].worker);
    }

    /**
     * @notice Job hash getter
     * @param jobId Job ID
     */
    function getJobHash(uint256 jobId) public view returns (uint256 jobHash) {
        return jobOffers[jobId].jobHash;
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
    function setFeeReceiver(address _feeReceiver) public {
        require(hasRole(ADMIN_ROLE, msg.sender), errMsg);
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Employer publish job
     * @param jobId Job ID
     * @param currency ERC20 token address or 0 if default
     */
    function publishJob(
        uint256 jobId,
        uint256 jobHash,
        IERC20 currency,
        uint256 amount
    ) public {
        require(currency != IERC20(0), "WorkLabor: invalid currency");
        JobOffer storage offer = jobOffers[jobId];
        require(offer.status == JobStatus.New, errMsg);
        uint256 comission = amount.mul(fee).div(fee.add(1e18));
        currency.transferFrom(msg.sender, address(this), amount.sub(comission));
        currency.transferFrom(msg.sender, feeReceiver, comission);
        offer.employer = msg.sender;
        offer.jobHash = jobHash;
        offer.currency = currency;
        offer.cost = amount.sub(comission);
        offer.status = JobStatus.Published;
    }

    /**
     * @notice Employer assigned worker to job
     * @param jobId Job ID
     * @param worker Workers wallet address
     */
    function assignJob(uint256 jobId, address worker) public {
        JobOffer storage offer = jobOffers[jobId];
        require(
            msg.sender == offer.employer && offer.status == JobStatus.Published,
            errMsg
        );
        require(worker != address(0), "WorkLabor: Invalid address");
        offer.worker = worker;
        offer.status = JobStatus.Assigned;
    }

    /**
     * @notice Worker process job
     * @param jobId Job ID
     */
    function processJob(uint256 jobId) public {
        JobOffer storage offer = jobOffers[jobId];
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
     * @param jobId Job ID
     */
    function verificationJob(uint256 jobId) public {
        JobOffer storage offer = jobOffers[jobId];
        require(
            msg.sender == offer.worker && offer.status == JobStatus.InProcess,
            errMsg
        );
        offer.status = JobStatus.Verification;
    }

    /**
     * @notice Employer decreased jobs cost
     * @param jobId Job ID
     */
    function decreaseCostJob(uint256 jobId, uint256 forfeit) public {
        JobOffer storage offer = jobOffers[jobId];
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
        offer.forfeit = forfeit;
        offer.status = JobStatus.DecreasedCost;
    }

    /**
     * @notice Employer or arbiter send job to rework
     * @param jobId Job ID
     */
    function reworkJob(uint256 jobId) public {
        JobOffer storage offer = jobOffers[jobId];
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
     * @param jobId Job ID
     */
    function arbitrationJob(uint256 jobId) public {
        JobOffer storage offer = jobOffers[jobId];
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
     * @param jobId Job ID
     */
    function acceptJob(uint256 jobId) public {
        JobOffer storage offer = jobOffers[jobId];
        require(
            (msg.sender == offer.employer &&
                offer.status == JobStatus.Verification) ||
                (msg.sender == offer.worker &&
                    offer.status == JobStatus.DecreasedCost) ||
                (hasRole(ARBITER_ROLE, msg.sender) &&
                    offer.status == JobStatus.Arbitration),
            errMsg
        );
        //FIXME: add transfer default currency
        //comission = (cost-forfeit)*fee
        //reward = cost-forfeit - comission
        uint256 comission = (offer.cost.sub(offer.forfeit)).mul(fee).div(1e18);
        offer.currency.transfer(
            offer.worker,
            offer.cost.sub(offer.forfeit).sub(comission)
        );
        if (offer.forfeit > 0) {
            offer.currency.transfer(offer.employer, offer.forfeit);
        }
        offer.currency.transfer(feeReceiver, comission);
        offer.status = JobStatus.Accepted;
    }

    /**
     * @notice Arbiter declined job
     * @param jobId Job ID
     */
    function declineJob(uint256 jobId) public {
        JobOffer storage offer = jobOffers[jobId];
        require(
            hasRole(ARBITER_ROLE, msg.sender) &&
                offer.status == JobStatus.Arbitration,
            errMsg
        );
        //FIXME: add transfer default currency
        uint256 comission = offer.cost.mul(fee).div(1e18);
        offer.currency.transfer(offer.employer, offer.cost.sub(comission));
        offer.currency.transfer(feeReceiver, comission);
        offer.status = JobStatus.Declined;
    }
}
