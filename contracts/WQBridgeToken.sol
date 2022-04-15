// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';

contract WQBridgeToken is
    Initializable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant MINTER_ROLE = keccak256('MINTER_ROLE');
    bytes32 public constant BURNER_ROLE = keccak256('BURNER_ROLE');
    bytes32 public constant PAUSER_ROLE = keccak256('PAUSER_ROLE');

    address private owner;

    mapping(address => bool) public isBlockListed;

    event AddedBlockList(address user);
    event RemovedBlockList(address user);

    function initialize(string memory name, string memory symbol)
        external
        initializer
    {
        __ERC20_init(name, symbol);
        __ERC20Pausable_init();
        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setRoleAdmin(MINTER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(BURNER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(PAUSER_ROLE, ADMIN_ROLE);
        owner = msg.sender;
    }

    /**
     * @dev Returns the owner of the token.
     * Binance Smart Chain BEP20 compatibility
     */
    function getOwner() external view returns (address) {
        return owner;
    }

    /**
     * @dev Mint token
     *
     * Requirements
     *
     * - `to` recipient address.
     * - `amount` amount of tokens.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @dev Burn token
     *
     * Requirements
     *
     * - `from` address of user.
     * - `amount` amount of tokens.
     */
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    /**
     * @dev Pause token
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        super._pause();
    }

    /**
     * @dev Pause token
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        super._unpause();
    }

    /**
     * @dev Add user address to blocklist
     *
     * Requirements
     *
     * - `user` address of user.
     */
    function addBlockList(address user) external onlyRole(ADMIN_ROLE) {
        isBlockListed[user] = true;
        emit AddedBlockList(user);
    }

    /**
     * @notice Remove user address from blocklist
     * @param user address of user.
     */
    function removeBlockList(address user) external onlyRole(ADMIN_ROLE) {
        isBlockListed[user] = false;
        emit RemovedBlockList(user);
    }

    /**
     * @notice Check blocklist when token minted, burned or transfered
     * @param from source address
     * @param to destination address
     * @param amount amount of tokens
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        ERC20PausableUpgradeable._beforeTokenTransfer(from, to, amount);
        require(isBlockListed[from] == false, 'Address from is blocklisted');
        require(isBlockListed[to] == false, 'Address to is blocklisted');
    }
}
