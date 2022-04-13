// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './WorkQuestFactoryInterface.sol';
import './WQReferralInterface.sol';
import './WQPensionFundInterface.sol';

contract WorkQuest {
    using SafeERC20 for IERC20;

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
    WQPensionFundInterface public immutable pensionFund;
    /// @notice Address of referral contract
    WQReferralInterface public immutable referral;
    /// @notice Address of quest factory
    WorkQuestFactoryInterface public immutable factory;

    /// @notice Fee coefficient of workquest
    uint256 public immutable fee;
    /// @notice Fee receiver address
    address public immutable feeReceiver;
    /// @notice Address of employer
    address public immutable employer;

    IERC20 public immutable wusd;

    /// @notice Hash of a text of a job offer
    bytes32 public jobHash;
    /// @notice Cost of job
    uint256 public cost;
    /// @notice Forfeit amount if worker didn't  job
    uint256 public forfeit;
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
     * @param _referral Address of a referral contract
     */
    constructor(
        bytes32 _jobHash,
        uint256 _fee,
        uint256 _cost,
        uint256 _deadline,
        address _employer,
        address _feeReceiver,
        address _pensionFund,
        address _referral,
        address _wusd
    ) {
        jobHash = _jobHash;
        fee = _fee;
        cost = _cost;
        deadline = _deadline;
        employer = _employer;
        feeReceiver = _feeReceiver;
        pensionFund = WQPensionFundInterface(_pensionFund);
        referral = WQReferralInterface(_referral);
        wusd = IERC20(_wusd);
        factory = WorkQuestFactoryInterface(msg.sender);
        status = JobStatus.Published;
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
            address _factory,
            JobStatus _status,
            uint256 _deadline
        )
    {
        return (
            jobHash,
            cost,
            forfeit,
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
        wusd.safeTransfer(employer, cost);
        emit JobCancelled();
    }

    function editJob(uint256 _cost) external {
        require(
            status == JobStatus.Published && msg.sender == employer,
            errMsg
        );
        if (_cost > cost) {
            uint256 comission = ((_cost - cost) * fee) / 1e18;
            wusd.safeTransfer(feeReceiver, comission);
            emit Received(_cost);
        } else if (_cost < cost) {
            wusd.safeTransfer(employer, cost - _cost);
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
            factory.hasRole(ARBITER_ROLE, msg.sender) &&
                status == JobStatus.Arbitration,
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
            factory.hasRole(ARBITER_ROLE, msg.sender) &&
                status == JobStatus.Arbitration,
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
            factory.hasRole(ARBITER_ROLE, msg.sender) &&
                status == JobStatus.Arbitration,
            errMsg
        );
        status = JobStatus.Finished;
        uint256 comission = (cost * fee) / 1e18;
        wusd.safeTransfer(employer, cost - comission);
        wusd.safeTransfer(feeReceiver, comission);
        emit ArbitrationRejectWork();
    }

    function _transferFunds() internal {
        uint256 newCost = cost - forfeit;
        uint256 comission = (newCost * fee) / 1e18;
        uint256 pensionContribute = (newCost * pensionFund.getFee(worker)) /
            1e18;
        wusd.safeTransfer(worker, newCost - comission - pensionContribute);
        if (pensionContribute > 0) {
            if (wusd.allowance(address(this), address(pensionFund)) > 0) {
                wusd.safeApprove(address(pensionFund), 0);
            }
            wusd.safeApprove(address(pensionFund), pensionContribute);
            pensionFund.contribute(worker, pensionContribute);
        }
        if (forfeit > 0) {
            wusd.safeTransfer(employer, forfeit);
        }
        referral.calcReferral(worker, newCost);
        wusd.safeTransfer(feeReceiver, comission);
    }
}
