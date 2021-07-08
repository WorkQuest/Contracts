// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./WorkQuest.sol";

contract WorkQuestFactory is AccessControl {
    bytes32 public ADMIN_ROLE = keccak256("ADMIN_ROLE");

    mapping(address => address[]) public workquests;

    /// @notice Mapping of arbiters adresses to boolean enabled
    mapping(address => bool) public arbiters;

    /// @notice List of arbiters adresses
    address payable[] public arbiterList;

    uint256 lastArbiter;

    /// @notice Fee amount
    uint256 public immutable fee;

    /// @notice Address of Fee receiver
    address payable public feeReceiver;

    /// @notice Address of pension fund contract
    address payable public immutable pensionFund;

    /**
     * @notice Create new WorkQuestFactory contract
     * @param _fee Fee of jobs cost
     * @param _feeReceiver Address of reciever of fee
     * @param _pensionFund Address of pension fund contract
     */
    constructor(
        uint256 _fee,
        address payable _feeReceiver,
        address payable _pensionFund
    ) {
        fee = _fee;
        feeReceiver = _feeReceiver;
        pensionFund = _pensionFund;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Check msg.sender is admin role
     */
    modifier onlyAdmin {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "WorkQuestFactory: You should have an admin role"
        );
        _;
    }

    /**
     * @notice Get list of adresses of employers workquests
     * @param employer Address of employer
     */
    function getWorkQuests(address employer)
        public
        view
        returns (address[] memory)
    {
        return workquests[employer];
    }

    /**
     * @notice Create new work quest contract
     * @param jobHash Hash of a text of a job offer
     * @param cost Job cost amount
     * @return workquest Address of workquest contract
     */
    function newWorkQuest(bytes32 jobHash, uint256 cost)
        public
        returns (address workquest)
    {
        workquest = address(
            new WorkQuest(
                jobHash,
                fee,
                cost,
                feeReceiver,
                pensionFund,
                payable(msg.sender),
                getArbiter()
            )
        );
        workquests[msg.sender].push(workquest);
        emit Created(msg.sender, workquest, block.timestamp);
        return workquest;
    }

    /**
     * @notice Enable or disable address of arbiter
     * @param arbiter Address of arbiter
     * @param enabled true - enable arbiter address, false - disable
     */
    function updateArbiter(address payable arbiter, bool enabled)
        public
        onlyAdmin
    {
        arbiters[arbiter] = enabled;
        if (enabled) {
            arbiterList.push(arbiter);
        }
    }

    /**
     * @notice Update address of fee receiver
     * @param _feeReceiver Address of fee receiver
     */
    function updateFeeReceiver(address payable _feeReceiver) public onlyAdmin {
        feeReceiver = _feeReceiver;
    }

    /// @notice Prevents accidental sending of ether to the factory
    receive() external payable {
        revert();
    }

    /**
     * @notice Get next enabled arbiter
     */
    function getArbiter() internal returns (address payable) {
        for (uint256 i = 0; i < arbiterList.length; i++) {
            lastArbiter++;
            if (lastArbiter >= arbiterList.length) lastArbiter = 0;
            if (arbiters[arbiterList[lastArbiter]]) break;
        }
        return arbiterList[lastArbiter];
    }

    /**
     * @notice Event emited when new workquest contract created
     */
    event Created(address employer, address workquest, uint256 createdAt);
}
