// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol';

contract WQPriceOracle is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using ECDSAUpgradeable for bytes32;
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');
    bytes32 public constant SERVICE_ROLE = keccak256('SERVICE_ROLE');

    struct TokenInfo {
        uint256 price;
        uint256 updatedAt;
        bool enabled;
    }
    mapping(string => TokenInfo) tokens;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(address service) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setupRole(SERVICE_ROLE, service);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(SERVICE_ROLE, ADMIN_ROLE);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /// @notice get other tokens price in USD
    function getTokenPriceUSD(string memory symbol)
        public
        view
        returns (uint256)
    {
        require(tokens[symbol].enabled, 'WQPriceOracle: Token is disabled');
        return tokens[symbol].price;
    }

    function setTokenPriceUSD(
        string memory symbol,
        uint256 price,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(tokens[symbol].enabled, 'WQPriceOracle: Token is disabled');
        require(
            hasRole(
                SERVICE_ROLE,
                keccak256(abi.encodePacked(symbol, price))
                    .toEthSignedMessageHash()
                    .recover(v, r, s)
            ),
            'WQReferal: validator is not a service'
        );
        tokens[symbol].price = price;
        tokens[symbol].updatedAt = block.timestamp;
    }
}
