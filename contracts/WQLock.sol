// Lock.sol
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';

/**
 * @dev A token holder contract that will allow a beneficiary to extract the
 * tokens at predefined intervals. Tokens not claimed at payment epochs accumulate
 * Modified version of Openzeppelin's TokenTimeLock
 */

contract WQLock is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    using AddressUpgradeable for address payable;

    //The length in seconds for each epoch between payments
    uint256 epochLength;
    // beneficiary of tokens after they are released
    address payable private beneficiary;
    //the size of periodic payments
    uint256 paymentSize;
    uint256 paymentsRemaining;
    uint256 startTime;
    uint256 beneficiaryBalance;

    event Received(uint256 amount);
    event Initialized(
        address payable beneficiary,
        uint256 epochLength,
        uint256 paymentsRemaining,
        uint256 startTime,
        uint256 paymentSize
    );
    event FundsReleasedToBeneficiary(
        address payable beneficiary,
        uint256 value,
        uint256 timeStamp
    );
    event BoxOpened();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address payable _beneficiary,
        uint256 _epochLength,
        uint256 _paymentsRemaining,
        uint256 _startTime,
        uint256 _paymentSize
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        beneficiary = _beneficiary;
        epochLength = _epochLength;
        paymentsRemaining = _paymentsRemaining;
        startTime = _startTime;
        paymentSize = _paymentSize;
        emit Initialized(
            beneficiary,
            epochLength,
            paymentsRemaining,
            startTime,
            paymentSize
        );
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}

    receive() external payable {
        emit Received(msg.value);
    }

    /**
     * @return box status.
     */
    function getStatus() public view returns (string memory) {
        if (address(this).balance > 0) return ('Box Closed');
        return ('Box Open');
    }

    /**
     * @return get time remaining.
     */
    function getTimeRemaining() public view returns (uint256) {
        uint256 last = startTime + epochLength;
        if (block.timestamp < last) return (last - block.timestamp);
        return (0);
    }

    /**
     * @return the get balance of the tokens.
     */
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @return the get payment size of the tokens.
     */
    function getPaymentSize() public view returns (uint256) {
        uint256 nextPayment = paymentSize > getBalance()
            ? getBalance()
            : paymentSize;
        return nextPayment;
    }

    function getElapsedReward()
        public
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        if (epochLength == 0) return (0, startTime, paymentsRemaining);
        uint256 elapsedEpochs = (block.timestamp - startTime) / epochLength;
        if (elapsedEpochs == 0) return (0, startTime, paymentsRemaining);
        elapsedEpochs = elapsedEpochs > paymentsRemaining
            ? paymentsRemaining
            : elapsedEpochs;
        uint256 newStartTime = block.timestamp;
        uint256 newPaymentsRemaining = paymentsRemaining - elapsedEpochs;
        uint256 balance = address(this).balance;
        uint256 accumulatedFunds = paymentSize * elapsedEpochs;
        return (
            beneficiaryBalance + accumulatedFunds > balance
                ? balance
                : accumulatedFunds,
            newStartTime,
            newPaymentsRemaining
        );
    }

    function updateBeneficiaryBalance() private {
        (beneficiaryBalance, startTime, paymentsRemaining) = getElapsedReward();
    }

    function changeBeneficiary(address payable _beneficiary) public onlyOwner {
        require(
            paymentsRemaining == 0,
            'TokenTimelock: cannot change beneficiary while token balance positive'
        );
        beneficiary = _beneficiary;
    }

    /**
     * @return the beneficiary of the tokens.
     */
    function getBeneficiary() public view returns (address payable) {
        return beneficiary;
    }

    /**
     * @notice Transfers tokens held by timelock to beneficiary.
     */
    function release() external {
        // solhint-disable-next-line not-rely-on-time
        require(
            block.timestamp >= startTime,
            'TokenTimelock: current time is before release time'
        );
        updateBeneficiaryBalance();
        uint256 amountToSend = beneficiaryBalance;
        beneficiaryBalance = 0;
        if (amountToSend > 0) beneficiary.sendValue(amountToSend);
        if (address(this).balance == 0) emit BoxOpened();
        emit FundsReleasedToBeneficiary(
            beneficiary,
            amountToSend,
            block.timestamp
        );
    }
}
