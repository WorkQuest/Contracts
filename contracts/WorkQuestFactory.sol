// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "./WorkQuest.sol";

contract WorkQuestFactory {
    mapping(address => address[]) public workquests;
    uint256 public immutable fee;
    address payable public immutable feeRecipient;
    address public immutable pensionWalletFactory;

    constructor(uint256 _fee, address payable _feeRecipient, address _pensionWalletFactory) {
        fee = _fee;
        feeRecipient = _feeRecipient;
        pensionWalletFactory = _pensionWalletFactory;
    }

    function getWorkQuests(address employer)
        public
        view
        returns (address[] memory)
    {
        return workquests[employer];
    }

    // Create new work quest contract
    function newWorkQuest() public returns (address) {
        address workquest = address(new WorkQuest(fee, feeRecipient,  pensionWalletFactory, msg.sender));
        workquests[msg.sender].push(workquest);
        emit Created(msg.sender, workquest, block.timestamp);
        return workquest;
    }

    // Prevents accidental sending of ether to the factory
    receive() external payable {
        revert();
    }

    event Created(address employer, address workquest, uint256 createdAt);
}
