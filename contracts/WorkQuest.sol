// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PensionFund.sol";

contract WorkQuest {
    event Received(address sender, uint256 amount);
    string constant errMsg = "WorkQuest: Access denied or invalid status";

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

    // Fee coefficient of workquest
    uint256 public immutable fee;
    // Fee receiver address
    address payable public immutable feeReceiver;
    // Pension wallet factory contract address
    address payable public immutable pensionFund;
    address payable public immutable employer;
    address payable public immutable arbiter;

    /**
     * @dev Job offer information
     * jobHash
     */
    bytes32 public jobHash;
    uint256 public cost;
    uint256 public forfeit;
    address payable public worker;
    JobStatus public status;
    uint256 public deadline;

    /**
     * @dev Create new WorkQuest contract
     * Requirements:
     * `_jobHash` - Hash of job agreement
     * `_fee` - Fee coefficient, from 0 to 1, 18 decimals
     * `_cost` - Cost of a job
     * `_feeReceiver` - Address of a fee reciever
     * `_pensionFund` - Address of a pension fund contract
     * `_employer` - External address of employer
     * `_arbiter` - External address of arbiter
     */

    constructor(
        bytes32 _jobHash,
        uint256 _fee,
        uint256 _cost,
        address payable _feeReceiver,
        address payable _pensionFund,
        address payable _employer,
        address payable _arbiter
    ) {
        jobHash = _jobHash;
        fee = _fee;
        cost = _cost;
        feeReceiver = _feeReceiver;
        pensionFund = _pensionFund;
        employer = _employer;
        arbiter = _arbiter;
    }

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

    /**
     * @notice Employer publish job by transfer funds to contract
     */
    receive() external payable {
        require(
            status == JobStatus.New || status == JobStatus.Published,
            errMsg
        );
        uint256 comission = (cost * fee) / 1e18;
        require(msg.value >= cost + comission, "WorkQuest: Insuffience amount");
        status = JobStatus.Published;
        if (msg.value > (cost + comission)) {
            payable(msg.sender).transfer(msg.value - cost - comission);
        }
        feeReceiver.transfer(comission);
        emit Received(msg.sender, msg.value);
    }

    /**
     * @notice Employer assigned worker to job
     * @param _worker Address of worker
     */
    function assignJob(address payable _worker) public {
        require(
            msg.sender == employer && status == JobStatus.Published,
            errMsg
        );
        require(_worker != address(0), "WorkQuest: Invalid address");
        status = JobStatus.Assigned;
        worker = _worker;
    }

    /**
     * @notice Worker process job
     */
    function processJob() public {
        require(
            msg.sender == worker &&
                (status == JobStatus.Assigned || status == JobStatus.Rework),
            errMsg
        );
        status = JobStatus.InProcess;
    }

    /**
     * @notice Worker send job to verification
     */
    function verificationJob() public {
        require(msg.sender == worker && status == JobStatus.InProcess, errMsg);
        status = JobStatus.Verification;
    }

    /**
     * @notice Employer decreased jobs cost
     * `_forfeit`
     */
    function decreaseCostJob(uint256 _forfeit) public {
        require(
            (msg.sender == employer &&
                (status == JobStatus.Verification ||
                    status == JobStatus.DecreasedCost)) ||
                (msg.sender == arbiter && status == JobStatus.Arbitration),
            errMsg
        );
        require(
            _forfeit <= cost,
            "WorkQuest: forfeit must be least or equal job cost"
        );
        status = JobStatus.DecreasedCost;
        forfeit = _forfeit;
    }

    /**
     * @notice Employer or arbiter send job to rework
     */
    function reworkJob() public {
        require(
            (msg.sender == employer && status == JobStatus.Verification) ||
                (msg.sender == arbiter && status == JobStatus.Arbitration),
            errMsg
        );
        status = JobStatus.Rework;
    }

    /**
     * @notice Employer or worker send job to arbitration
     */
    function arbitrationJob() public {
        require(
            (msg.sender == employer && status == JobStatus.Verification) ||
                (msg.sender == worker &&
                    (status == JobStatus.Rework ||
                        status == JobStatus.DecreasedCost)),
            errMsg
        );
        status = JobStatus.Arbitration;
    }

    /**
     * @notice Employer accepted job
     */
    function acceptJob() public {
        require(
            (msg.sender == employer && status == JobStatus.Verification) ||
                (msg.sender == worker && status == JobStatus.DecreasedCost) ||
                (msg.sender == arbiter && status == JobStatus.Arbitration),
            errMsg
        );
        status = JobStatus.Accepted;
        uint256 newCost = cost - forfeit;
        uint256 comission = (newCost * fee) / 1e18;
        (, uint256 pensionFee, , ) = PensionFund(pensionFund).wallets(worker);
        uint256 pensionContribute = (newCost * pensionFee) / 1e18;
        worker.transfer(newCost - comission - pensionFee);
        if (pensionFee > 0) {
            PensionFund(pensionFund).contribute{value: pensionContribute}(
                worker
            );
        }
        if (forfeit > 0) {
            employer.transfer(forfeit);
        }
        feeReceiver.transfer(comission);
    }

    /**
     * @notice Arbiter declined job
     */
    function declineJob() public {
        require(
            msg.sender == arbiter && status == JobStatus.Arbitration,
            errMsg
        );
        status = JobStatus.Declined;
        uint256 comission = (cost * fee) / 1e18;
        employer.transfer(cost - comission);
        feeReceiver.transfer(comission);
    }
}
