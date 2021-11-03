// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import './WQPriceOracle.sol';
import './WQRouterVault.sol';

contract WQRouter is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address payable;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant SERVICE_ROLE = keccak256('SERVICE_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    struct UserCollateral {
        uint256 collateralAmount;
        uint256 collateralPrice;
        uint256 debtAmount;
        WQRouterVault vault;
    }

    WQPriceOracle oracle;
    IERC20Upgradeable token;

    mapping(address => UserCollateral) collateral;

    event Produced(uint256 collateral, uint256 debt, address borrower);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(address _token) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(SERVICE_ROLE, ADMIN_ROLE);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        token = IERC20Upgradeable(_token);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    function produceWUSD(uint256 collateralAmount) external nonReentrant {
        UserCollateral storage userCollateral = collateral[msg.sender];
        if (userCollateral.vault == WQRouterVault(address(0))) {
            userCollateral.vault = new WQRouterVault();
        }
        userCollateral.collateralAmount += collateralAmount;
        uint256 price = oracle.getTokenPriceUSD(
            IERC20MetadataUpgradeable(address(token)).symbol()
        );
        userCollateral.collateralPrice = price;
        userCollateral.debtAmount += (collateralAmount * price * 2) / 3e18;

        // Take tokens
        token.safeTransferFrom(
            msg.sender,
            address(userCollateral.vault),
            collateralAmount
        );
        // Send native coins
        payable(msg.sender).sendValue(userCollateral.debtAmount);
        emit Produced(collateralAmount, userCollateral.debtAmount, msg.sender);
    }

    function removeCollateral(uint256 debtAmount)
        external
        payable
        nonReentrant
    {}

    function liquidateCollateral() external payable nonReentrant {}

    function updateToken(address _token) external onlyRole(ADMIN_ROLE) {
        token = IERC20Upgradeable(_token);
    }
}
