// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./WorkQuest.sol";

contract WorkQuestFactory is AccessControl {
    bytes32 public ADMIN_ROLE = keccak256("ADMIN_ROLE");
    mapping(address => address[]) public workquests;
    mapping(address => bool) arbiters;
    address payable[] arbiterList;
    uint256 lastArbiter;
    uint256 public immutable fee;
    address payable public immutable feeReciever;
    address payable public immutable pensionFund;

    constructor(
        uint256 _fee,
        address payable _feeReciever,
        address payable _pensionFund
    ) {
        fee = _fee;
        feeReciever = _feeReciever;
        pensionFund = _pensionFund;
    }

    modifier onlyAdmin {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "WorkQuestFactory: You should have a admin role"
        );
        _;
    }

    function getWorkQuests(address employer)
        public
        view
        returns (address[] memory)
    {
        return workquests[employer];
    }

    // Create new work quest contract
    function newWorkQuest(bytes32 jobHash, uint256 cost)
        public
        returns (address)
    {
        address workquest = address(
            new WorkQuest(
                jobHash,
                fee,
                cost,
                feeReciever,
                pensionFund,
                payable(msg.sender),
                getArbiter()
            )
        );
        workquests[msg.sender].push(workquest);
        emit Created(msg.sender, workquest, block.timestamp);
        return workquest;
    }

    function updateArbiter(address arbiter, bool enabled) public onlyAdmin {
        arbiters[arbiter] = enabled;
        arbiterList.push(payable(arbiter));
    }

    // Prevents accidental sending of ether to the factory
    receive() external payable {
        revert();
    }

    /**
     * @dev Get next enabled arbiter
     */
    function getArbiter() internal returns (address payable) {
        for (uint256 i = 0; i < arbiterList.length; i++) {
            lastArbiter++;
            if (lastArbiter >= arbiterList.length) lastArbiter = 0;
            if (arbiters[arbiterList[lastArbiter]]) break;
        }
        return arbiterList[lastArbiter];
    }

    event Created(address employer, address workquest, uint256 createdAt);
}
