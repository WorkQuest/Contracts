// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./WQTokenInterface.sol";

contract WorkQuestBridge is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

    bool private _initialized;

    // 1 - WorkQuest, 2 - ETH, 3 - BSC
    uint256 public immutable chainId;

    // Address of proxy of WQToken
    address public immutable token;

    // chainList[chainId] = enabled
    mapping(uint256 => bool) public chainList;

    // Struct of swap
    struct SwapData {
        uint256 transaction; // transaction number
        State state;
    }

    // swaps[hashedMsg] = SwapData
    mapping(bytes32 => SwapData) public swaps;

    // Status of swap
    enum State {
        Empty,
        Initialized,
        Redeemed
    }

    /**
     * @dev Emitted when swap to other chain created
     *
     */
    event SwapInitialized(
        uint256 timestamp,
        address indexed initiator,
        address recipient,
        uint256 amount,
        uint256 chainTo,
        uint256 nonce
    );

    /**
     * @dev Emitted when swap redeemed.
     */
    event SwapRedeemed(
        address indexed initiator,
        uint256 timestamp,
        uint256 nonce
    );

    function initialize(uint256 _chainId, address _token) external {
        require(
            !_initialized,
            "WorkQuestBridge: Contract instance has already been initialized"
        );
        // Grant the contract deployer the default admin role: it will be able
        // to grant and revoke any roles
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);

        // Sets `ADMIN_ROLE` as `VALIDATOR_ROLE`'s admin role.
        _setRoleAdmin(VALIDATOR_ROLE, ADMIN_ROLE);
        // Sets `ADMIN_ROLE` as `MINTER_ROLE`'s admin role.
        _setRoleAdmin(MINTER_ROLE, ADMIN_ROLE);
        // Sets `ADMIN_ROLE` as `BURNER_ROLE`'s admin role.
        _setRoleAdmin(BURNER_ROLE, ADMIN_ROLE);
        // Sets `ADMIN_ROLE` as `PAUSER_ROLE`'s admin role.
        _setRoleAdmin(PAUSER_ROLE, ADMIN_ROLE);

        chainId = _chainId; // 1 - DEL, 2 - ETH, 3 - BSC
        token = _token;
    }

    function swap(
        uint256 amount,
        uint256 nonce,
        address recipient,
        uint256 chainTo
    ) external {
        require(chainTo != chainId, "WorkQuestBridge: Invalid chainTo id");
        require(
            chainList[chainTo],
            "WorkQuestBridge: ChainTo id is not allowed"
        );
    }

    function redeem(
        uint256 amount,
        address recipient,
        uint256 nonce,
        uint256 chainFrom,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(chainFrom != chainId, "WorkQuestBridge: Invalid chainFrom id");
        require(
            chainList[chainFrom],
            "WorkQuestBridge: ChainFrom id not allowed"
        );
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
            "WorkQuestBridge: Caller is not an admin"
        );
        chainList[_chainId] = enabled;
    }
}
