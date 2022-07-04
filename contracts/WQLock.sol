// Lock.sol
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';

/**
 * @dev A token holder contract that will allow a beneficiary to extract the
 * tokens at predefined intervals. Tokens not claimed at payment epochs accumulate
 * Modified version of Openzeppelin's TokenTimeLock
 */

contract Lock is OwnableUpgradeable {
    using AddressUpgradeable for address payable;
    enum period {
        second,
        minute,
        hour,
        day,
        week,
        month, //inaccurate, assumes 30 day month, subject to drift
        year,
        quarter, //13 weeks
        biannual //26 weeks
    }

    //The length in seconds for each epoch between payments
    uint256 epochLength;

    // beneficiary of tokens after they are released
    address payable private _beneficiary;

    uint256 periods;

    //the size of periodic payments
    uint256 paymentSize;
    uint256 paymentsRemaining = 0;
    uint256 startTime = 0;
    uint256 beneficiaryBalance = 0;

    event PaymentsUpdatedOnDeposit(
        uint256 paymentSize,
        uint256 startTime,
        uint256 paymentsRemaining
    );
    event Initialized(
        address payable beneficiary,
        uint256 duration,
        uint256 periods
    );
    event FundsReleasedToBeneficiary(
        address payable beneficiary,
        uint256 value,
        uint256 timeStamp
    );
    event BoxOpened();
    event BoxClosed();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address payable beneficiary,
        uint256 duration,
        uint256 durationMultiple,
        uint256 p
    ) public onlyOwner {
        release();
        require(
            paymentsRemaining == 0,
            'cannot initialize during active vesting schedule'
        );
        require(duration > 0 && p > 0, 'epoch parameters must be positive');
        _beneficiary = beneficiary;
        if (duration <= uint256(period.biannual)) {
            if (duration == uint256(period.second)) {
                epochLength = durationMultiple * 1 seconds;
            } else if (duration == uint256(period.minute)) {
                epochLength = durationMultiple * 1 minutes;
            } else if (duration == uint256(period.hour)) {
                epochLength = durationMultiple * 1 hours;
            } else if (duration == uint256(period.day)) {
                epochLength = durationMultiple * 1 days;
            } else if (duration == uint256(period.week)) {
                epochLength = durationMultiple * 1 weeks;
            } else if (duration == uint256(period.month)) {
                epochLength = durationMultiple * 30 days;
            } else if (duration == uint256(period.year)) {
                epochLength = durationMultiple * 52 weeks;
            } else if (duration == uint256(period.quarter)) {
                epochLength = durationMultiple * 13 weeks;
            } else if (duration == uint256(period.biannual)) {
                epochLength = 26 weeks;
            }
        } else {
            epochLength = duration; //custom value
        }
        periods = p;

        emit Initialized(beneficiary, epochLength, p);
    }

    function deposit(uint256 _startTime) external payable {
        if (paymentsRemaining == 0) {
            paymentsRemaining = periods;
            startTime = _startTime;
        }
        paymentSize = msg.value / paymentsRemaining;
        emit PaymentsUpdatedOnDeposit(
            paymentSize,
            startTime,
            paymentsRemaining
        );
        emit BoxClosed();
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

    function changeBeneficiary(address payable beneficiary) public onlyOwner {
        require(
            paymentsRemaining == 0,
            'TokenTimelock: cannot change beneficiary while token balance positive'
        );
        _beneficiary = beneficiary;
    }

    /**
     * @return the beneficiary of the tokens.
     */
    function getBeneficiary() public view returns (address payable) {
        return _beneficiary;
    }

    /**
     * @notice Transfers tokens held by timelock to beneficiary.
     */
    function release() public {
        // solhint-disable-next-line not-rely-on-time
        require(
            block.timestamp >= startTime,
            'TokenTimelock: current time is before release time'
        );
        updateBeneficiaryBalance();
        uint256 amountToSend = beneficiaryBalance;
        beneficiaryBalance = 0;
        if (amountToSend > 0) _beneficiary.sendValue(amountToSend);
        if (address(this).balance == 0) emit BoxOpened();
        emit FundsReleasedToBeneficiary(
            _beneficiary,
            amountToSend,
            block.timestamp
        );
    }
}
