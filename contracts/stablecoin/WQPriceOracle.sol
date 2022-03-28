// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

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
        uint256 updatedTime;
        bool enabled;
    }

    uint256 public validTime;
    uint256 public lastNonce;
    mapping(string => TokenInfo) public tokens;

    event Priced(
        uint256 nonce,
        uint256 price,
        uint256 timestamp,
        string symbol
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @dev
     */
    function initialize(address service, uint256 _validTime)
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
        validTime = _validTime;
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
    function getTokenPriceUSD(string calldata symbol)
        public
        view
        returns (uint256)
    {
        TokenInfo storage token = tokens[symbol];
        require(token.enabled, "WQPriceOracle: Token is disabled");
        require(
            block.timestamp <= token.updatedTime + validTime,
            "WQPriceOracle: Price is outdated"
        );
        return token.price;
    }

    /**
     * @dev Set price of token in USD
     * @param timestamp Serial number of transaction
     * @param symbol Symbol of token
     * @param price Price of token in USD
     * @param v V of signature
     * @param r R of signature
     * @param s S of signature
     */
    function setTokenPriceUSD(
        uint256 timestamp,
        uint256 price,
        uint8 v,
        bytes32 r,
        bytes32 s,
        string calldata symbol
    ) external {
        require(tokens[symbol].enabled, "WQPriceOracle: Token is disabled");
        require(
            timestamp > lastNonce,
            "WQPriceOracle: Invalid nonce value, must be greater that lastNonce"
        );
        require(
            block.timestamp >= tokens[symbol].updatedTime + validTime / 2,
            "WQPriceOracle: Price is not outdated yet"
        );
        require(
            hasRole(
                SERVICE_ROLE,
                keccak256(abi.encodePacked(timestamp, price, symbol))
                    .toEthSignedMessageHash()
                    .recover(v, r, s)
            ),
            "WQPriceOracle: validator is not a service"
        );
        tokens[symbol].price = price;
        tokens[symbol].updatedTime = block.timestamp;
        lastNonce = timestamp;
        emit Priced(timestamp, price, block.timestamp, symbol);
    }

    /**
     * @dev Set price of token in USD
     * @param timestamp Serial number of transaction
     * @param v V of signature
     * @param r R of signature
     * @param s S of signature
     * @param prices Array of prices of tokens in USD
     * @param symbols Array of symbols of tokens
     */
    function setTokenPricesUSD(
        uint256 timestamp,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256[] calldata prices,
        string[] calldata symbols
    ) external {
        require(
            prices.length == symbols.length,
            "WQPriceOracle: Array lengths are not equals"
        );
        require(
            timestamp > lastNonce,
            "WQPriceOracle: Invalid nonce value, must be greater that lastNonce"
        );
        bytes memory allsymbols;
        for (uint256 i = 0; i < symbols.length; i++) {
            allsymbols = abi.encodePacked(allsymbols, symbols[i]);
        }
        require(
            hasRole(
                SERVICE_ROLE,
                keccak256(abi.encodePacked(timestamp, prices, allsymbols))
                    .toEthSignedMessageHash()
                    .recover(v, r, s)
            ),
            "WQPriceOracle: validator is not a service"
        );
        lastNonce = timestamp;
        for (uint256 i = 0; i < prices.length; i++) {
            if (
                tokens[symbols[i]].enabled &&
                block.timestamp >=
                tokens[symbols[i]].updatedTime + validTime / 2
            ) {
                tokens[symbols[i]].price = prices[i];
                tokens[symbols[i]].updatedTime = block.timestamp;
                emit Priced(timestamp, prices[i], block.timestamp, symbols[i]);
            }
        }
    }

    /**
     * @dev Set time during which the price is valid
     * @param _validTime Duration in seconds
     */
    function setValidTime(uint256 _validTime) external onlyRole(ADMIN_ROLE) {
        validTime = _validTime;
    }

    function updateToken(bool enabled, string calldata symbol)
        external
        onlyRole(ADMIN_ROLE)
    {
        tokens[symbol].enabled = enabled;
    }
}
