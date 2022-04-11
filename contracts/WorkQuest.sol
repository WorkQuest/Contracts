// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/utils/Address.sol';
import './WQPensionFund.sol';
import './WQReferral.sol';

interface WorkQuestFactoryInterface {
    function hasRole(bytes32 role, address account)
        external
        view
        returns (bool);
}

contract WorkQuest {
    using Address for address payable;

    bytes32 public constant ARBITER_ROLE = keccak256('ARBITER_ROLE');
    string constant errMsg = 'WorkQuest: Access denied or invalid status';

    /**
     * @notice Job offer statuses
     */
    enum JobStatus {
        New,
        Published,
        WaitWorker,
        InProgress,
        WaitJobVerify,
        Arbitration,
        Finished
    }

    /// @notice Pension wallet factory contract address
    WQPensionFund public immutable pensionFund;
    /// @notice Address of referal contract
    WQReferral public immutable referal;
    /// @notice Address of quest factory
    WorkQuestFactoryInterface public immutable factory;

    /// @notice Fee coefficient of workquest
    uint256 public immutable fee;
    /// @notice Fee receiver address
    address payable public immutable feeReceiver;
    /// @notice Address of employer
    address payable public immutable employer;

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

    /// @notice Event emitted when employer edit job
    event JobEdited(uint256 cost);

    /// @notice Event emitted when employer publish job by transfer funds to contract
    event Received(uint256 amount);

    /// @notice Event emitted when employer assign worker to job
    event Assigned(address worker);

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
     * @param _deadline Deadline timestamp
     * @param _employer External address of employer
     * @param _feeReceiver Address of a fee reciever
     * @param _pensionFund Address of a pension fund contract
     * @param _referal Address of a referral contract
     */
    constructor(
        bytes32 _jobHash,
        uint256 _fee,
        uint256 _cost,
        uint256 _deadline,
        address payable _employer,
        address payable _feeReceiver,
        address _pensionFund,
        address payable _referal
    ) {
        jobHash = _jobHash;
        fee = _fee;
        cost = _cost;
        deadline = _deadline;
        employer = _employer;
        feeReceiver = _feeReceiver;
        pensionFund = WQPensionFund(_pensionFund);
        referal = WQReferral(_referal);
        factory = WorkQuestFactoryInterface(msg.sender);
        emit WorkQuestCreated(jobHash);
    }

    /**
     * @notice Get info about contract state
     * @dev Return parameters jobHash, cost, forfeit, employer, worker, status, deadline
     */
    function getInfo()
        public
        view
        returns (
            bytes32 _jobHash,
            uint256 _cost,
            uint256 _forfeit,
            address _employer,
            address _worker,
            JobStatus _status,
            uint256 _deadline
        )
    {
        return (jobHash, cost, forfeit, employer, worker, status, deadline);
    }

    /**
     * @notice Employer publish job by transfer funds to contract
     */
    receive() external payable {
        require(status == JobStatus.New, errMsg);
        uint256 comission = (cost * fee) / 1e18;
        require(
            msg.value >= cost + comission,
            'WorkQuest: Insufficient amount'
        );
        status = JobStatus.Published;
        if (msg.value > cost + comission) {
            payable(employer).sendValue(msg.value - cost - comission);
        }
        feeReceiver.sendValue(comission);
        emit Received(cost);
    }

    function cancelJob() external {
        require(
            status == JobStatus.Published && msg.sender == employer,
            errMsg
        );
        status = JobStatus.Finished;
        payable(employer).sendValue(cost);
        emit JobCancelled();
    }

    function editJob(uint256 _cost) external payable {
        require(
            status == JobStatus.Published && msg.sender == employer,
            errMsg
        );
        // jobHash = _jobHash;
        if (_cost > cost) {
            uint256 comission = ((_cost - cost) * fee) / 1e18;
            require(
                msg.value >= _cost - cost + comission,
                'WorkQuest: Insufficient amount'
            );
            if (msg.value > _cost - cost + comission) {
                payable(employer).sendValue(
                    msg.value - (_cost - cost + comission)
                );
            }
            feeReceiver.sendValue(comission);
            emit Received(msg.value);
        } else if (_cost < cost) {
            require(msg.value == 0, 'WorkQuest: Invalid value amount');
            payable(employer).sendValue(cost - _cost);
        }
        cost = _cost;
        emit JobEdited(_cost);
    }

    /**
     * @notice Employer assigned worker to job
     * @param _worker Address of worker
     */
    function assignJob(address payable _worker) external {
        require(
            msg.sender == employer &&
                (status == JobStatus.Published ||
                    status == JobStatus.WaitWorker),
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
                    block.timestamp > timeDone + 1 minutes), //3 days),
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
            factory.hasRole(ARBITER_ROLE, msg.sender) &&
                status == JobStatus.Arbitration,
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
            factory.hasRole(ARBITER_ROLE, msg.sender) && status == JobStatus.Arbitration,
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
            factory.hasRole(ARBITER_ROLE, msg.sender) && status == JobStatus.Arbitration,
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
            factory.hasRole(ARBITER_ROLE, msg.sender) && status == JobStatus.Arbitration,
            errMsg
        );
        status = JobStatus.Finished;
        uint256 comission = (cost * fee) / 1e18;
        employer.sendValue(cost - comission);
        feeReceiver.sendValue(comission);
        emit ArbitrationRejectWork();
    }

    function _transferFunds() internal {
        uint256 newCost = cost - forfeit;
        uint256 comission = (newCost * fee) / 1e18;
        uint256 pensionContribute = (newCost * pensionFund.getFee(worker)) /
            1e18;
        worker.sendValue(newCost - comission - pensionContribute);
        if (pensionContribute > 0) {
            pensionFund.contribute{value: pensionContribute}(worker);
        }
        if (forfeit > 0) {
            employer.sendValue(forfeit);
        }
        referal.calcReferral(worker, newCost - comission);

        feeReceiver.sendValue(comission);
    }
}
