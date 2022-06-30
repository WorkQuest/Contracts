// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import './WorkQuestFactoryInterface.sol';
import './WQReferralInterface.sol';
import './WQPensionFundInterface.sol';

contract WorkQuest {
    using SafeERC20 for IERC20;
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

    /// @notice Address of quest factory
    WorkQuestFactoryInterface public immutable factory;

    /// @notice Address of employer
    address public immutable employer;

    /// @notice Hash of a text of a job offer
    bytes32 public jobHash;
    /// @notice Cost of job
    uint256 public cost;
    /// @notice Address of worker
    address public worker;
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
    event ArbitrationStarted(uint256 timestamp);

    /// @notice Event emitted when
    event ArbitrationRework(uint256 timestamp);

    /// @notice Event emitted when
    event ArbitrationAcceptWork(uint256 timestamp);

    /// @notice Event emitted when
    event ArbitrationRejectWork(uint256 timestamp);

    bool private initialized;

    /**
     * @notice Create new WorkQuest contract
     * @param _jobHash Hash of job agreement
     * @param _cost Cost of a job
     * @param _deadline Deadline timestamp
     * @param _employer External address of employer
     */
    constructor(
        bytes32 _jobHash,
        uint256 _cost,
        uint256 _deadline,
        address _employer
    ) {
        jobHash = _jobHash;
        cost = _cost;
        deadline = _deadline;
        employer = _employer;
        factory = WorkQuestFactoryInterface(msg.sender);
        status = JobStatus.Published;
        emit WorkQuestCreated(jobHash);
    }

    /**
     * @notice Get info about contract state
     * @dev Return parameters jobHash, cost, employer, worker, status, deadline
     */
    function getInfo()
        public
        view
        returns (
            bytes32 _jobHash,
            uint256 _cost,
            address _employer,
            address _worker,
            address _factory,
            JobStatus _status,
            uint256 _deadline
        )
    {
        return (
            jobHash,
            cost,
            employer,
            worker,
            address(factory),
            status,
            deadline
        );
    }

    function cancelJob() external {
        require(
            (status == JobStatus.Published || status == JobStatus.WaitWorker) &&
                msg.sender == employer,
            errMsg
        );
        status = JobStatus.Finished;
        IERC20(factory.wusd()).safeTransfer(employer, cost);
        emit JobCancelled();
    }

    function editJob(uint256 _cost) external {
        require(
            status == JobStatus.Published && msg.sender == employer,
            errMsg
        );
        if (_cost > cost) {
            uint256 comission = ((_cost - cost) * factory.feeWorker()) / 1e18;
            IERC20(factory.wusd()).safeTransferFrom(
                msg.sender,
                address(this),
                (_cost - cost)
            );
            IERC20(factory.wusd()).safeTransferFrom(
                msg.sender,
                factory.feeReceiver(),
                comission
            );
            emit Received(_cost);
        } else if (_cost < cost) {
            IERC20(factory.wusd()).safeTransfer(employer, cost - _cost);
        }
        cost = _cost;
        emit JobEdited(_cost);
    }

    /**
     * @notice Employer assigned worker to job
     * @param _worker Address of worker
     */
    function assignJob(address _worker) external {
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
    function arbitration() external payable {
        require(
            (msg.sender == employer && status == JobStatus.WaitJobVerify) ||
                (
                    msg.sender == employer &&
                        status == JobStatus.InProgress &&
                        deadline > 0
                        ? block.timestamp > deadline
                        : false
                ) ||
                (msg.sender == worker &&
                    status == JobStatus.WaitJobVerify &&
                    block.timestamp > timeDone + 3 days),
            errMsg
        );
        require(msg.value >= factory.feeTx(), 'WorkQuest: insufficient fee');
        status = JobStatus.Arbitration;
        emit ArbitrationStarted(block.timestamp);
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
        payable(msg.sender).sendValue(address(this).balance);
        emit ArbitrationRework(block.timestamp);
    }

    /**
     * @notice Arbiter accepted job result
     */
    function arbitrationAcceptWork() external {
        require(
            factory.hasRole(ARBITER_ROLE, msg.sender) &&
                status == JobStatus.Arbitration,
            errMsg
        );
        status = JobStatus.Finished;
        _transferFunds();
        payable(msg.sender).sendValue(address(this).balance);
        emit ArbitrationAcceptWork(block.timestamp);
    }

    /**
     * @notice Arbiter declined job
     */
    function arbitrationRejectWork() external {
        require(
            factory.hasRole(ARBITER_ROLE, msg.sender) &&
                status == JobStatus.Arbitration,
            errMsg
        );
        status = JobStatus.Finished;
        uint256 comission = (cost * factory.feeWorker()) / 1e18;
        IERC20(factory.wusd()).safeTransfer(employer, cost - comission);
        IERC20(factory.wusd()).safeTransfer(factory.feeReceiver(), comission);
        payable(msg.sender).sendValue(address(this).balance);
        emit ArbitrationRejectWork(block.timestamp);
    }

    function _transferFunds() internal {
        uint256 newCost = cost;
        uint256 comission = (newCost * factory.feeWorker()) / 1e18;
        uint256 pensionContribute = (newCost *
            WQPensionFundInterface(factory.pensionFund()).getFee(worker)) /
            1e18;
        IERC20(factory.wusd()).safeTransfer(
            worker,
            newCost - comission - pensionContribute
        );
        if (pensionContribute > 0) {
            if (
                IERC20(factory.wusd()).allowance(
                    address(this),
                    factory.pensionFund()
                ) > 0
            ) {
                IERC20(factory.wusd()).safeApprove(factory.pensionFund(), 0);
            }
            IERC20(factory.wusd()).safeApprove(
                factory.pensionFund(),
                pensionContribute
            );
            WQPensionFundInterface(factory.pensionFund()).contribute(
                worker,
                pensionContribute
            );
        }
        WQReferralInterface(factory.referral()).calcReferral(worker, newCost);
        WQReferralInterface(factory.referral()).calcReferral(employer, newCost);
        IERC20(factory.wusd()).safeTransfer(factory.feeReceiver(), comission);
    }
}
