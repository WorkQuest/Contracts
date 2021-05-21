// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "./PensionWallet.sol";

contract PensionWalletFactory {
    mapping(address => address[]) wallets;

    function getWallets(address _user) public view returns (address[] memory) {
        return wallets[_user];
    }

    function newWallet(address _owner, uint256 _unlockDate)
        public
        payable
        returns (address)
    {
        // Create new wallet.
        address wallet = address(new PensionWallet(_owner, _unlockDate));

        wallets[_owner].push(wallet);

        // Emit event
        emit Created(
            wallet,
            msg.sender,
            _owner,
            block.timestamp,
            _unlockDate,
            msg.value
        );
        return wallet;
    }

    // Prevents accidental sending of ether to the factory
    receive() external payable {
        revert();
    }

    event Created(
        address wallet,
        address from,
        address to,
        uint256 createdAt,
        uint256 unlockDate,
        uint256 amount
    );
}
