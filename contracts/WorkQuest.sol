// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./PensionWalletFactory.sol";

contract WorkQuest {
    using SafeMath for uint256;

    event Received(address sender, uint256 _cost);
    string constant errMsg = "WorkLabor: Access denied or invalid status";

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
    address public immutable pensionWalletFactory;

    /**
     * @dev Job offer information
     * jobHash
     */
    bytes32 public jobHash;
    uint256 public cost;
    uint256 public forfeit;
    address payable public employer;
    address payable public worker;
    address payable public arbiter;
    JobStatus public status;
    uint256 public deadline;

    constructor(
        uint256 _fee,
        address payable _feeReceiver,
        address _pensionWalletFactory,
        address payable _employer
    ) {
        fee = _fee;
        feeReceiver = _feeReceiver;
        pensionWalletFactory = _pensionWalletFactory;
        employer = _employer;
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
     * @notice Employer created new job
     * @param _jobHash Job hash
     * @param _cost Job _cost
     */
    function newJob(bytes32 _jobHash, uint256 _cost) public {
        require(status == JobStatus.New, errMsg);
        employer = msg.sender;
        jobHash = _jobHash;
        cost = _cost;
    }

    /**
     * @notice Employer publish job by transfer funds to contract
     */
    receive() external payable {
        uint256 comission = cost.mul(fee).div(1e18);
        cost = cost.add(comission);
        require(msg.value >= cost, "WorkLabor: Insuffience amount");
        status = JobStatus.Published;
        if (msg.value > cost) {
            msg.sender.transfer(msg.value.sub(cost));
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
        require(_worker != address(0), "WorkLabor: Invalid address");
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
            "WorkLabor: forfeit must be least or equal job cost"
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
        //comission = (cost - forfeit)*fee
        //reward = cost - forfeit - comission
        uint256 _cost = cost.sub(forfeit);
        uint256 comission = _cost.mul(fee).div(1e18);
        uint256 pensionFee = 0;
        address pensionWallet = PensionWalletFactory(payable(pensionWalletFactory)).currentWallet(worker);
        if (pensionWallet != address(0)) {
            //TODO: check pensionWallet is contract
            pensionFee = _cost.mul(PensionWallet(payable(pensionWallet)).fee()).div(1e18);
        }
        worker.transfer(_cost.sub(comission).sub(pensionFee));
        payable(pensionWallet).transfer(pensionFee);
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
        uint256 comission = cost.mul(fee).div(1e18);
        employer.transfer(cost.sub(comission));
        feeReceiver.transfer(comission);
    }
}
