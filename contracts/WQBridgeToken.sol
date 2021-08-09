// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract WQBridgeToken is ERC20Pausable, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    address private owner;

    mapping(address => bool) public isBlockListed;

    event AddedBlockList(address user);
    event RemovedBlockList(address user);

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        owner = msg.sender;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setRoleAdmin(BRIDGE_ROLE, ADMIN_ROLE);
        _setRoleAdmin(PAUSER_ROLE, ADMIN_ROLE);
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
    function mint(address to, uint256 amount) external {
        require(
            hasRole(MINTER_ROLE, msg.sender),
            "You should have a bridge role"
        );
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
    function burn(address from, uint256 amount) external {
        require(
            hasRole(BURNER_ROLE, msg.sender),
            "You should have a bridge role"
        );
        _burn(from, amount);
    }

    /**
     * @dev Pause token
     */
    function pause() external {
        require(
            hasRole(PAUSER_ROLE, msg.sender),
            "BridgeToken: You should have a pauser role"
        );
        super._pause();
    }

    /**
     * @dev Pause token
     */
    function unpause() external {
        require(
            hasRole(PAUSER_ROLE, msg.sender),
            "BridgeToken: You should have a pauser role"
        );
        super._unpause();
    }

    /**
     * @dev Add user address to blocklist
     *
     * Requirements
     *
     * - `user` address of user.
     */
    function addBlockList(address user) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "BridgeToken: You should have an admin role"
        );
        isBlockListed[user] = true;
        emit AddedBlockList(user);
    }

    /**
     * @notice Remove user address from blocklist
     * @param user address of user.
     */
    function removeBlockList(address user) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "BridgeToken: You should have an admin role"
        );
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
        ERC20Pausable._beforeTokenTransfer(from, to, amount);
        require(isBlockListed[from] == false, "Address from is blocklisted");
        require(isBlockListed[to] == false, "Address to is blocklisted");
    }
}
