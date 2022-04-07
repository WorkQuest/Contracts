// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import './WQPriceOracleInterface.sol';
import './WorkQuestFactory.sol';

contract WQPromotion is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using AddressUpgradeable for address payable;
    using SafeERC20Upgradeable for IERC20MetadataUpgradeable;
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    enum PaidTariff {
        GoldPlus,
        Gold,
        Silver,
        Bronze
    }

    /// @notice Address of the fee receiver
    address payable public feeReceiver;
    WorkQuestFactory public factory;
    // IERC20MetadataUpgradeable public token;
    // WQPriceOracleInterface public oracle;
    mapping(PaidTariff => mapping(uint256 => uint256)) public questTariff;
    mapping(PaidTariff => mapping(uint256 => uint256)) public usersTariff;

    event PromotedQuest(
        address quest,
        PaidTariff tariff,
        uint256 period,
        uint256 promotedAt
    );

    event PromotedUser(
        address user,
        PaidTariff tariff,
        uint256 period,
        uint256 promotedAt
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(address payable _feeReceiver, address _factory)
        external
        // address _token,
        // address _oracle
        initializer
    {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        feeReceiver = _feeReceiver;
        factory = WorkQuestFactory(_factory);
        // token = IERC20MetadataUpgradeable(_token);
        // oracle = WQPriceOracleInterface(_oracle);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    function promoteQuest(
        address quest,
        PaidTariff tariff,
        uint256 period
    ) external payable nonReentrant {
        require(
            factory.workquestValid(quest),
            'WQPromotion: Quest is not WorkQuest contract'
        );
        require(questTariff[tariff][period] > 0, 'WQPromotion: Invalid tariff');
        require(
            msg.value == questTariff[tariff][period],
            'WQPromotion: Invalid cost'
        );
        feeReceiver.sendValue(msg.value);
        emit PromotedQuest(quest, tariff, period, block.timestamp);
    }

    function promoteUser(PaidTariff tariff, uint256 period)
        external
        payable
        nonReentrant
    {
        require(usersTariff[tariff][period] > 0, 'WQPromotion: Invalid tariff');
        require(
            msg.value == usersTariff[tariff][period],
            'WQPromotion: Invalid cost'
        );
        feeReceiver.sendValue(msg.value);
        emit PromotedUser(msg.sender, tariff, period, block.timestamp);
    }

    /**
     * Admin Functions
     */

    /**
     * @dev Set address of workquest factory
     * @param _factory Address of token
     */
    function setFactory(address _factory) external onlyRole(ADMIN_ROLE) {
        factory = WorkQuestFactory(_factory);
    }

    /**
     * @dev Set price oracle address
     * @param _oracle Address of price oracle
     */
    // function setOracle(address _oracle) external onlyRole(ADMIN_ROLE) {
    //     oracle = WQPriceOracleInterface(_oracle);
    // }

    /**
     * @dev Set token address
     * @param _token Address of token
     */
    // function setToken(address _token) external onlyRole(ADMIN_ROLE) {
    //     token = IERC20MetadataUpgradeable(_token);
    // }

    /**
     * @notice Set user tariff
     * @param tariff Tariff number
     * @param period Period
     * @param cost Cost of promotion
     */
    function setUserTariff(
        PaidTariff tariff,
        uint256 period,
        uint256 cost
    ) external onlyRole(ADMIN_ROLE) {
        usersTariff[tariff][period] = cost;
    }

    /**
     * @notice Set quest tariff
     * @param tariff Tariff number
     * @param period Period
     * @param cost Cost of promotion
     */
    function setQuestTariff(
        PaidTariff tariff,
        uint256 period,
        uint256 cost
    ) external onlyRole(ADMIN_ROLE) {
        questTariff[tariff][period] = cost;
    }
}
