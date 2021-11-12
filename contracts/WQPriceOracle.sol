// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

contract WQPriceOracle is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using ECDSAUpgradeable for bytes32;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant SERVICE_ROLE = keccak256("SERVICE_ROLE");

    struct TokenInfo {
        uint256 price;
        uint256 updatedBlock;
        bool enabled;
    }

    uint256 public validBlocks;
    uint256 public lastNonce;
    mapping(string => TokenInfo) public tokens;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @dev
     */
    function initialize(address service, uint256 _validBlocks)
        public
        initializer
    {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setupRole(SERVICE_ROLE, service);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(SERVICE_ROLE, ADMIN_ROLE);
        validBlocks = _validBlocks;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @dev get price of token in USD
     * @param symbol symbol of token
     */
    function getTokenPriceUSD(string memory symbol)
        public
        view
        returns (uint256)
    {
        TokenInfo storage token = tokens[symbol];
        require(token.enabled, "WQPriceOracle: Token is disabled");
        require(block.number > token.updatedBlock, "WQPriceOracle: Same block");
        require(
            block.number - token.updatedBlock <= validBlocks,
            "WQPriceOracle: Price is outdated"
        );
        return token.price;
    }

    /**
     * @dev Set price of token in USD
     * @param nonce Serial number of transaction
     * @param symbol Symbol of token
     * @param price Price of token in USD
     * @param v V of signature
     * @param r R of signature
     * @param s S of signature
     */
    function setTokenPriceUSD(
        uint256 nonce,
        uint256 price,
        uint8 v,
        bytes32 r,
        bytes32 s,
        string memory symbol
    ) external {
        require(tokens[symbol].enabled, "WQPriceOracle: Token is disabled");
        require(nonce > lastNonce, "WQPriceOracle: This price has already been set earlier");
        require(
            hasRole(
                SERVICE_ROLE,
                keccak256(abi.encodePacked(nonce, price, symbol))
                    .toEthSignedMessageHash()
                    .recover(v, r, s)
            ),
            "WQPriceOracle: validator is not a service"
        );
        tokens[symbol].price = price;
        tokens[symbol].updatedBlock = block.number;
        lastNonce = nonce;
    }

    /**
     * @dev Set number of blocks during which the price is valid
     * @param _validBlocks Number of blocks
     */
    function setValidBlocks(uint256 _validBlocks)
        external
        onlyRole(ADMIN_ROLE)
    {
        validBlocks = _validBlocks;
    }

    function updateToken(bool enabled, string memory symbol)
        external
        onlyRole(ADMIN_ROLE)
    {
        tokens[symbol].enabled = enabled;
    }
}
