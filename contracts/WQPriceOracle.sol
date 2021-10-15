// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';

contract WQPriceOracle is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
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

    /// @notice Get WorkQuest Token price in USD
    function getTokenPriceUSD() external returns (uint256 price_) {
        return getTokenPriceUSD('WQT');
    }

    /// @notice get other tokens price in USD
    function getTokenPriceUSD(string memory symbol)
        public
        returns (uint256 price_)
    {
        // ATTENTION it's just for testing
        price_ = 228 * (10**18);
        return price_;
    }
}
