// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./TokenInterface.sol";

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

    /**
     * @notice settings of chain - wrapped token address and enable
     */
    struct TokenSettings {
        address token;
        bool enabled;
        bool native;
    }

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

    address payable public vault;

    /// @notice 1 - WorkQuest, 2 - ETH, 3 - BSC
    uint256 public immutable chainId;

    bool private _initialized;

    /// @notice List of enabled chain ID's
    mapping(uint256 => bool) public chains;

    /// @notice
    mapping(string => TokenSettings) public tokens;

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

    constructor(uint256 _chainId) {
        // Grant the contract deployer the default admin role: it will be able
        // to grant and revoke any roles
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        // Sets `ADMIN_ROLE` as `VALIDATOR_ROLE`'s admin role.
        _setRoleAdmin(VALIDATOR_ROLE, ADMIN_ROLE);

        chainId = _chainId; // 1 - DEL, 2 - ETH, 3 - BSC
    }

    /**
     * @dev Creates new swap. Emits a {SwapInitialized} event.
     * @param nonce Number of transaction
     * @param chainTo Destination chain id
     * @param amount Amount of tokens
     * @param recipient Recipient address in target network
     * @param symbol Symbol of token
     */
    function swap(
        uint256 nonce,
        uint256 chainTo,
        uint256 amount,
        address recipient,
        string memory symbol
    ) external payable {
        require(chainTo != chainId, "WorkQuest Bridge: Invalid chainTo id");
        require(
            chains[chainTo],
            "WorkQuest Bridge: ChainTo ID is not allowed"
        );
        TokenSettings storage token = tokens[symbol];
        require(
            token.enabled,
            "WorkQuest Bridge: This token not registered or disabled"
        );

        bytes32 message = keccak256(
            abi.encodePacked(nonce, amount, recipient, chainId, chainTo, symbol)
        );
        require(
            swaps[message].state == State.Empty,
            "WorkQuest Bridge: Swap is not empty state or duplicate transaction"
        );

        swaps[message] = SwapData({nonce: nonce, state: State.Initialized});
        if (token.native) {
            require(
                msg.value == amount,
                "WorkQuest Bridge: Amount value is not equal to transfered funds"
            );
        } else {
            TokenInterface(token.token).burn(msg.sender, amount);
        }
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
     * @dev Execute redeem. Emits a {SwapRedeemed} event
     * @param nonce number of transaction
     * @param chainFrom source chain id
     * @param amount amount of tokens
     * @param recipient recipient address in target network
     * @param v v of signature
     * @param r r of signature
     * @param s s of signature
     * @param symbol Symbol of token
     */
    function redeem(
        uint256 nonce,
        uint256 chainFrom,
        uint256 amount,
        address payable recipient,
        uint8 v,
        bytes32 r,
        bytes32 s,
        string memory symbol
    ) external {
        require(chainFrom != chainId, "WorkQuest Bridge: Invalid chainFrom ID");
        require(
            chains[chainFrom],
            "WorkQuest Bridge: ChainFrom ID is not allowed"
        );
        TokenSettings storage token = tokens[symbol];
        require(
            token.enabled,
            "WorkQuest Bridge: This token not registered or disabled"
        );

        bytes32 message = keccak256(
            abi.encodePacked(
                nonce,
                amount,
                recipient,
                chainFrom,
                chainId,
                symbol
            )
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
        if (token.native) {
            recipient.transfer(amount);
        } else {
            TokenInterface(token.token).mint(recipient, amount);
        }

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
     * @param _chainId id of chain
     * @param enabled true - enabled, false - disabled direction
     */
    function updateChain(uint256 _chainId, bool enabled) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "WorkQuest Bridge: Caller is not an admin"
        );
        chains[_chainId] = enabled;
    }

    /**
     * @notice Update token settings
     * @param token - address of token
     * @param native If money is native for this chain set true
     */
    function updateToken(
        address token,
        bool enabled,
        bool native,
        string memory symbol
    ) public {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "WorkQuest Bridge: Caller is not an admin"
        );
        require(
            bytes(symbol).length > 0,
            "WorkQuest Bridge: Symbol length must be greater than 0"
        );
        tokens[symbol] = TokenSettings({
            token: token,
            enabled: enabled,
            native: native
        });
    }
}
