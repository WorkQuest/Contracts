// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "./PensionWallet.sol";

contract PensionWalletFactory {
    event Created(
        address wallet,
        address owner,
        uint256 createdAt,
        uint256 unlockDate
    );

    mapping(address => address[]) public wallets;
    mapping(address => address) public currentWallet;

    function getWallets(address _user) public view returns (address[] memory) {
        return wallets[_user];
    }

    /**
     * @dev Create a new pension wallet
     * `fee` fee of a cost of a workquest
     */
    function newWallet(uint256 fee, uint256 unlockDate) public returns (address) {
        address wallet = address(new PensionWallet(msg.sender, fee, unlockDate));

        wallets[msg.sender].push(wallet);
        currentWallet[msg.sender] = wallet;

        emit Created(wallet, msg.sender, block.timestamp, unlockDate);
        return wallet;
    }

    function setCurrentWallet(address wallet) public {
        currentWallet[msg.sender] = wallet;
    }
}
