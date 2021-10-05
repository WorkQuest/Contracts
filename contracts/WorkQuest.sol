// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./WQPensionFund.sol";
import "./WQReferal.sol";

contract WorkQuest is AccessControl {
    string constant errMsg = 'WorkQuest: Access denied or invalid status';
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

    /**
     * @notice Job offer statuses
     */
    enum JobStatus {
        New,
        Published,
        WaitWorker,
        WaitJobStart,
        InProgress,
        WaitJobVerify,
        Arbitration,
        Finished
    }

    /// @notice Fee coefficient of workquest
    uint256 public fee;
    /// @notice Fee receiver address
    address payable public feeReceiver;
    /// @notice Pension wallet factory contract address
    address payable public pensionFund;
    /// @notice Address of employer
    address payable public employer;
    /// @notice Address of arbiter
    address payable public immutable arbiter;
    /// @notice Address of referal contract
    address payable public immutable referal; 

    /// @notice Hash of a text of a job offer
    bytes32 public jobHash;
    /// @notice Cost of job
    uint256 public cost;
    /// @notice Forfeit amount if worker didn't  job
    uint256 public forfeit;
    /// @notice Address of worker
    address payable public worker;
    /// @notice Current status of job
    JobStatus public status;
    /// @notice Deadline timestamp
    uint256 public deadline;
    /// @notice Done timestamp of job
    uint256 public timeDone;

    /// @notice Event emitted when job created
    event WorkQuestCreated(bytes32 jobHash);

    /// @notice Event emitted when employer cancel job
    event JobCancelled();

    /// @notice Event emitted when employer publish job by transfer funds to contract
    event Received(address sender, uint256 amount);

    /// @notice Event emitted when employer assign worker to job
    event Assigned(address worker);

    /// @notice Event emitted when worker accepted job to work
    event JobAccepted();

    /// @notice Event emitted when worker declined job
    event JobDeclined();

    /// @notice Event emitted when worker set job status InProcess
    event JobStarted();

    /// @notice Event emitted when worker set job to Verification
    event JobDone();

    /// @notice Event emitted when
    event JobFinished();

    /// @notice Event emitted when
    event ArbitrationStarted();

    /// @notice Event emitted when
    event ArbitrationRework();

    /// @notice Event emitted when
    event ArbitrationDecreaseCost();

    /// @notice Event emitted when
    event ArbitrationAcceptWork();

    /// @notice Event emitted when
    event ArbitrationRejectWork();

    bool private initialized;

    /**
     * @notice Create new WorkQuest contract
     * @param _jobHash Hash of job agreement
     * @param _fee Fee coefficient, from 0 to 1, 18 decimals
     * @param _cost Cost of a job
     * @param _feeReceiver Address of a fee reciever
     * @param _pensionFund Address of a pension fund contract
     * @param _employer External address of employer
     * @param _arbiter External address of arbiter
     */
    constructor(
        bytes32 _jobHash,
        uint256 _fee,
        uint256 _cost,
        uint256 _deadline,
        address payable _feeReceiver,
        address payable _pensionFund,
        address payable _employer,
        address payable _arbiter,
        address payable _referal
    ) {
        jobHash = _jobHash;
        fee = _fee;
        cost = _cost;
        deadline = _deadline;
        feeReceiver = _feeReceiver;
        pensionFund = _pensionFund;
        employer = _employer;
        arbiter = _arbiter;
        referal = _referal;
        // TODO: grant admin role to admin  // CHECK
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);

        emit WorkQuestCreated(jobHash);
    }

    /**
     * @notice Get info about contract state
     * @dev Return parameters jobHash, cost, forfeit, employer, worker, arbiter, status, deadline
     */
    function getInfo()
        public
        view
        returns (
            bytes32,
            uint256,
            uint256,
            address,
            address,
            address,
            JobStatus,
            uint256
        )
    {
        return (
            jobHash,
            cost,
            forfeit,
            employer,
            worker,
            arbiter,
            status,
            deadline
        );
    }

    function cancelJob() external {
        require(status == JobStatus.New && msg.sender == employer, errMsg);
        status = JobStatus.Finished;
        emit JobCancelled();
    }

    /**
     * @notice Employer publish job by transfer funds to contract
     */
    receive() external payable {
        require(status == JobStatus.New, errMsg);
        uint256 comission = (cost * fee) / 1e18;
        require(msg.value >= cost + comission, 'WorkQuest: Insuffience amount');
        status = JobStatus.Published;
        if (msg.value > cost + comission) {
            payable(msg.sender).transfer(msg.value - cost - comission);
        }
        feeReceiver.transfer(comission);
        emit Received(msg.sender, msg.value);
    }

    /**
     * @notice Employer assigned worker to job
     * @param _worker Address of worker
     */
    function assignJob(address payable _worker) external {
        require(
            msg.sender == employer && status == JobStatus.Published,
            errMsg
        );
        require(_worker != address(0), 'WorkQuest: Invalid address');
        status = JobStatus.WaitWorker;
        worker = _worker;
        emit Assigned(worker);
    }

    /**
     * @notice Worker accepted job to work
     */
    function acceptJob() external {
        require(msg.sender == worker && status == JobStatus.WaitWorker, errMsg);
        status = JobStatus.WaitJobStart;
        emit JobAccepted();
    }

    /**
     * @notice Worker decline job
     */
    function declineJob() external {
        require(msg.sender == worker && status == JobStatus.WaitWorker, errMsg);
        status = JobStatus.Published;
        emit JobDeclined();
    }

    /**
     * @notice Worker process job
     */
    function processJob() external {
        require(
            msg.sender == worker && status == JobStatus.WaitJobStart,
            errMsg
        );
        status = JobStatus.InProgress;
        emit JobStarted();
    }

    /**
     * @notice Worker send job to verification
     */
    function verificationJob() external {
        require(msg.sender == worker && status == JobStatus.InProgress, errMsg);
        status = JobStatus.WaitJobVerify;
        timeDone = block.timestamp;
        emit JobDone();
    }

    /**
     * @notice Employer accepted job
     */
    function acceptJobResult() external {
        require(
            msg.sender == employer && status == JobStatus.WaitJobVerify,
            errMsg
        );
        status = JobStatus.Finished;
        _transferFunds();
        emit JobFinished();
    }

    /**
     * @notice Employer or worker send job to arbitration
     */
    function arbitration() external {
        require(
            (msg.sender == employer && status == JobStatus.WaitJobVerify) ||
                (msg.sender == worker &&
                    status == JobStatus.WaitJobVerify &&
                    block.timestamp > timeDone + 3 days),
            errMsg
        );
        status = JobStatus.Arbitration;
        emit ArbitrationStarted();
    }

    /**
     * @notice Arbiter send job to rework
     */
    function arbitrationRework() external {
        require(
            msg.sender == arbiter && status == JobStatus.Arbitration,
            errMsg
        );
        deadline = block.timestamp + 3 days;
        status = JobStatus.InProgress;
        emit ArbitrationRework();
    }

    /**
     * @notice Employer decreased jobs cost
     * @param _forfeit Forfeit amount
     */

    function arbitrationDecreaseCost(uint256 _forfeit) external {
        require(
            msg.sender == arbiter && status == JobStatus.Arbitration,
            errMsg
        );
        require(
            _forfeit <= cost,
            'WorkQuest: forfeit must be least or equal job cost'
        );
        status = JobStatus.Finished;
        forfeit = _forfeit;
        _transferFunds();
        emit ArbitrationDecreaseCost();
    }

    /**
     * @notice Arbiter accepted job result
     */
    function arbitrationAcceptWork() external {
        require(
            msg.sender == arbiter && status == JobStatus.Arbitration,
            errMsg
        );
        status = JobStatus.Finished;
        _transferFunds();
        emit ArbitrationAcceptWork();
    }

    /**
     * @notice Arbiter declined job
     */
    function arbitrationRejectWork() external {
        require(
            msg.sender == arbiter && status == JobStatus.Arbitration,
            errMsg
        );
        status = JobStatus.Finished;
        uint256 comission = (cost * fee) / 1e18;
        employer.transfer(cost - comission);
        feeReceiver.transfer(comission);
        emit ArbitrationRejectWork();
    }

    function setFeeReceiver(address payable _feeReceiver) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "WorkQuest: You don't have an admin role"
        );
        feeReceiver = _feeReceiver;
    }

    function _transferFunds() internal {
        uint256 newCost = cost - forfeit;
        uint256 comission = (newCost * fee) / 1e18;
        (, uint256 pensionFee, , ) = WQPensionFund(pensionFund).wallets(worker);
        uint256 pensionContribute = (newCost * pensionFee) / 1e18;
        worker.transfer(newCost - comission - pensionContribute);
        if (pensionFee > 0) {
            WQPensionFund(pensionFund).contribute{value: pensionContribute}(
                worker
            );
        }
        if (forfeit > 0) {
            employer.transfer(forfeit);
        }
        WQReferal(referal).payReferral();
        feeReceiver.transfer(comission);
    }
}
