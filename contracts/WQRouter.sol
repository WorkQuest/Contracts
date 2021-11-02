// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';

import './WQPriceOracle.sol';

contract WQRouter is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using AddressUpgradeable for address payable;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant SERVICE_ROLE = keccak256('SERVICE_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    struct UserCollateral {
        uint256 collateralAmount;
        uint256 debtAmount;
    }

    WQPriceOracle oracle;

    mapping(address => UserCollateral) collateral;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize() external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(SERVICE_ROLE, ADMIN_ROLE);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    function produceWUSD(uint256 _collateralAmount) external nonReentrant {
        collateral[msg.sender].collateralAmount = _collateralAmount;
        collateral[msg.sender].debtAmount = (_collateralAmount * 15) / 10;
    }

    function addCollateral(uint256 amount) external nonReentrant {}

    function removeCollateral(uint256 amount) external nonReentrant {}

    function liquidateCollateral() external nonReentrant {}
}
