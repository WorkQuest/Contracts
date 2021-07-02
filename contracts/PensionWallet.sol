// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

contract PensionWallet {
    event Received(address from, uint256 amount);
    event Withdrew(address to, uint256 amount);

    address public owner;
    uint256 public fee;
    uint256 public unlockDate;
    uint256 public createdAt;

    modifier onlyOwner {
        require(msg.sender == owner);
        _;
    }

    constructor(address _owner, uint256 _fee, uint256 _unlockDate) {
        owner = _owner;
        fee = _fee;
        unlockDate = _unlockDate;
        createdAt = block.timestamp;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    function withdraw() public onlyOwner {
        require(block.timestamp >= unlockDate);
        msg.sender.transfer(address(this).balance);
        emit Withdrew(msg.sender, address(this).balance);
    }

    function info()
        public
        view
        returns (
            address,
            uint256,
            uint256,
            uint256
        )
    {
        return (owner, unlockDate, createdAt, address(this).balance);
    }
}
