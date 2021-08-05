// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./WQFundInterface.sol";

contract WQPensionFund is WQFundInterface, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant BORROWER_ROLE = keccak256("BORROWER_ROLE");

    uint256 public immutable lockTime;
    uint256 public defaultFee;
    uint256 public contributed;
    uint256 public borrowed;
    bool private _entered;

    /// @notice Event emitted when funds transferred to contract
    event Received(address from, uint256 amount);

    /// @notice Event emitted when funds withrew from contract
    event Withdrew(address to, uint256 amount);

    /// @notice Event emitted when funds withrew from contract
    event Borrowed(uint256 amount);

    struct PensionWallet {
        uint256 amount;
        uint256 fee;
        uint256 unlockDate;
        uint256 createdAt;
    }

    /// @notice Pension wallet info of worker
    mapping(address => PensionWallet) public wallets;

    constructor(uint256 _lockTime, uint256 _defaultFee) {
        lockTime = _lockTime;
        defaultFee = _defaultFee;
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
            wallet.fee = defaultFee;
        }
        wallet.amount += msg.value;
        contributed += msg.value;
        emit Received(worker, msg.value);
    }

    /**
     * @notice Withdraw funds from contract after 3 years
     * @param amount Amount of withdrawing funds
     */
    function withdraw(uint256 amount) external {
        require(!_entered, "WQPension: Reentrancy guard");
        _entered = true;
        PensionWallet storage wallet = wallets[msg.sender];
        require(block.timestamp >= wallet.unlockDate);
        require(amount <= wallet.amount);
        wallet.amount -= amount;
        contributed -= amount;
        payable(msg.sender).transfer(amount);
        emit Withdrew(msg.sender, amount);
        _entered = false;
    }

    /**
     * @notice Update fee of job cost
     * @param fee Fee of job cost
     * @dev First calling set variable createdAt as current timestamp and
     * @dev unlockDate as current_timestamp + 3*365 days
     */
    function updateFee(uint256 fee) external {
        PensionWallet storage wallet = wallets[msg.sender];
        if (wallet.createdAt == 0) {
            wallet.createdAt = block.timestamp;
            wallet.unlockDate = block.timestamp + lockTime;
        }
        wallet.fee = fee;
    }

    function updateDefaultFee(uint256 _defaultFee) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "WQPension: You are not have an admin role"
        );
        defaultFee = _defaultFee;
    }

    function balanceOf() external view override returns (uint256) {
        return contributed - borrowed;
    }

    function borrow(uint256 amount) external override {
        require(!_entered, "WQPension: Reentrancy guard");
        _entered = true;
        require(
            hasRole(BORROWER_ROLE, msg.sender),
            "WQPension: You are not have a borrower role"
        );
        require(
            amount <= contributed - borrowed,
            "WQPension: Insuffience amount"
        );
        borrowed += amount;
        payable(msg.sender).transfer(amount);
        emit Borrowed(amount);
        _entered = false;
    }

    // TODO: implement it
    function refund() external payable override {}

    receive() external payable {
        revert();
    }
}
