// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./WQTokenInterface.sol";

contract WQBridge is AccessControl {
    /// @notice Statuses of a swap
    enum State {
        Empty,
        Initialized,
        Redeemed
    }

    /// @notice Swap info structure
    struct SwapData {
        uint256 nonce;
        State state;
    }

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

    /// @notice Address of proxy of WQToken
    address public token;

    /// @notice 1 - WorkQuest, 2 - ETH, 3 - BSC
    uint256 public immutable chainId;

    bool private _initialized;

    /// @notice List of enabled chain ID's
    mapping(uint256 => bool) public chainList;

    // Map of message hash to swap state
    mapping(bytes32 => SwapData) public swaps;

    /**
     * @dev Emitted when swap created
     */
    event SwapInitialized(
        uint256 timestamp,
        uint256 nonce,
        address indexed initiator,
        address recipient,
        uint256 amount,
        uint256 chainTo
    );

    /**
     * @dev Emitted when swap redeemed.
     */
    event SwapRedeemed(
        uint256 timestamp,
        uint256 nonce,
        address indexed initiator
    );

    constructor(uint256 _chainId, address _token) {
        // Grant the contract deployer the default admin role: it will be able
        // to grant and revoke any roles
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        // Sets `ADMIN_ROLE` as `VALIDATOR_ROLE`'s admin role.
        _setRoleAdmin(VALIDATOR_ROLE, ADMIN_ROLE);

        chainId = _chainId; // 1 - DEL, 2 - ETH, 3 - BSC
        token = _token;
    }

    /**
     * @dev Creates new swap. Emits a {SwapInitialized} event.
     * @param nonce number of transaction
     * @param chainTo destination chain id
     * @param amount amount of tokens
     * @param recipient recipient address in another network.
     */
    function swap(
        uint256 nonce,
        uint256 chainTo,
        uint256 amount,
        address recipient
    ) external {
        require(chainTo != chainId, "WorkQuest Bridge: Invalid chainTo id");
        require(
            chainList[chainTo],
            "WorkQuest Bridge: ChainTo ID is not allowed"
        );

        bytes32 message = keccak256(
            abi.encodePacked(nonce, amount, recipient, chainId, chainTo)
        );
        require(
            swaps[message].state == State.Empty,
            "WorkQuest Bridge: Swap is not empty state or duplicate transaction"
        );

        swaps[message] = SwapData({nonce: nonce, state: State.Initialized});
        WQTokenInterface(token).burn(msg.sender, amount);
        emit SwapInitialized(
            block.timestamp,
            nonce,
            msg.sender,
            recipient,
            amount,
            chainTo
        );
    }

    /**
     * @dev Execute redeem. Emits a {SwapRedeemed} event.
     * @param nonce number of transaction.
     * @param chainFrom source chain id
     * @param amount amount of tokens
     * - `c` recipient address in this network.


     * - `v` v of signature.
     * - `r` r of signature.
     * - `s` s of signature.
     * - `tokenSymbol` symbol of token
     */
    function redeem(
        uint256 nonce,
        uint256 chainFrom,
        uint256 amount,
        address recipient,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(chainFrom != chainId, "WorkQuest Bridge: Invalid chainFrom ID");
        require(
            chainList[chainFrom],
            "WorkQuest Bridge: ChainFrom ID is not allowed"
        );

        bytes32 message = keccak256(
            abi.encodePacked(nonce, amount, recipient, chainFrom, chainId)
        );
        require(
            swaps[message].state == State.Empty,
            "WorkQuest Bridge: Swap is not empty state or duplicate transaction"
        );

        bytes32 hashedMsg = ECDSA.toEthSignedMessageHash(message);
        address signer = ECDSA.recover(hashedMsg, v, r, s);
        require(
            hasRole(VALIDATOR_ROLE, signer),
            "WorkQuest Bridge: Validator address is invalid or signature is faked"
        );

        swaps[message] = SwapData({nonce: nonce, state: State.Redeemed});
        WQTokenInterface(token).mint(recipient, amount);
        emit SwapRedeemed(block.timestamp, nonce, msg.sender);
    }

    /**
     * @dev Returns swap state.
     *
     * Requirements
     *
     * - `_hashedSecret` hash of swap.
     */
    function getSwapState(bytes32 message) external view returns (State state) {
        return swaps[message].state;
    }

    /**
     * @notice Add enabled chain direction to bridge
     * @param _chainId id of chain.
     * @param enabled true - enabled, false - disabled direction.
     */
    function updateChain(uint256 _chainId, bool enabled) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "WorkQuest Bridge: Caller is not an admin"
        );
        chainList[_chainId] = enabled;
    }

    /**
     * @notice Set address of WQT token
     * @param _token Address of token
     */
    function setToken(address _token) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "WorkQuest Bridge: Caller is not an admin"
        );
        token = _token;
    }
}
