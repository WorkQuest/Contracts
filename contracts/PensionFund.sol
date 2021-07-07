// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract PensionFund {
    uint256 constant DEFAULT_FEE = 1e16; // 1%

    event Received(address from, uint256 amount);
    event Withdrew(address to, uint256 amount);

    struct PensionWallet {
        uint256 amount;
        uint256 fee;
        uint256 unlockDate;
        uint256 createdAt;
    }

    mapping(address => PensionWallet) public wallets;

    constructor() {}

    function contribute(address worker) external payable {
        PensionWallet storage wallet = wallets[worker];
        if (wallet.createdAt == 0) {
            wallet.createdAt = block.timestamp;
            wallet.unlockDate = block.timestamp + (3 * 365 days);
            wallet.fee = DEFAULT_FEE;
        }
        wallet.amount += msg.value;
        emit Received(worker, msg.value);
    }

    function withdraw(uint256 amount) public {
        PensionWallet storage wallet = wallets[msg.sender];
        require(block.timestamp >= wallet.unlockDate);
        require(amount <= wallet.amount);
        wallet.amount -= amount;
        payable(msg.sender).transfer(amount);
        emit Withdrew(msg.sender, amount);
    }

    function updateFee(uint256 _fee) public {
        PensionWallet storage wallet = wallets[msg.sender];
        if (wallet.createdAt == 0) {
            wallet.createdAt = block.timestamp;
            wallet.unlockDate = block.timestamp + (3 * 365 days);
        }
        wallet.fee = _fee;
    }

    receive() external payable {
        revert();
    }
}
