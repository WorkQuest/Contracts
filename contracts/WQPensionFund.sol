// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract WQPensionFund {
    uint256 constant DEFAULT_FEE = 1e16; // 1%
    uint256 public immutable lockTime;

    /// @notice Event emitted when funds transferred to contract
    event Received(address from, uint256 amount);
    /// @notice Event emitted when funds withrew from contract
    event Withdrew(address to, uint256 amount);

    struct PensionWallet {
        uint256 amount;
        uint256 fee;
        uint256 unlockDate;
        uint256 createdAt;
    }

    /// @notice Pension wallet info of worker
    mapping(address => PensionWallet) public wallets;

    constructor(uint256 _lockTime) {
        lockTime = _lockTime;
    }

    /**
     * @notice Contribute native moneys to contract on 3 years
     * @dev First contributing set variable createdAt as current timestamp,
     * @dev unlockDate as current_timestamp + 3*365 days
     * @dev and fee as DEFAULT_FEE value (1%)
     * @param worker Address of worker
     */
    function contribute(address worker) external payable {
        PensionWallet storage wallet = wallets[worker];
        if (wallet.createdAt == 0) {
            wallet.createdAt = block.timestamp;
            wallet.unlockDate = block.timestamp + lockTime;
            wallet.fee = DEFAULT_FEE;
        }
        wallet.amount += msg.value;
        emit Received(worker, msg.value);
    }

    /**
     * @notice Withdraw funds from contract after 3 years
     * @param amount Amount of withdrawing funds
     */
    function withdraw(uint256 amount) public {
        PensionWallet storage wallet = wallets[msg.sender];
        require(block.timestamp >= wallet.unlockDate);
        require(amount <= wallet.amount);
        wallet.amount -= amount;
        payable(msg.sender).transfer(amount);
        emit Withdrew(msg.sender, amount);
    }

    /**
     * @notice Update fee of job cost
     * @param _fee Fee of job cost
     * @dev First calling set variable createdAt as current timestamp and
     * @dev unlockDate as current_timestamp + 3*365 days
     */
    function updateFee(uint256 _fee) public {
        PensionWallet storage wallet = wallets[msg.sender];
        if (wallet.createdAt == 0) {
            wallet.createdAt = block.timestamp;
            wallet.unlockDate = block.timestamp + lockTime;
        }
        wallet.fee = _fee;
    }

    receive() external payable {
        revert();
    }
}
