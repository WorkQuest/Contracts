// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import './WorkQuestFactoryInterface.sol';

contract WQPromotion is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    enum PaidTariff {
        GoldPlus,
        Gold,
        Silver,
        Bronze
    }

    /// @notice Address of the fee receiver
    WorkQuestFactoryInterface public factory;
    IERC20Upgradeable public wusd;
    address public feeReceiver;
    mapping(PaidTariff => mapping(uint256 => uint256)) public questTariff;
    mapping(PaidTariff => mapping(uint256 => uint256)) public usersTariff;

    event PromotedQuest(
        address quest,
        PaidTariff tariff,
        uint256 period,
        uint256 promotedAt,
        uint256 amount
    );

    event PromotedUser(
        address user,
        PaidTariff tariff,
        uint256 period,
        uint256 promotedAt,
        uint256 amount
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _feeReceiver,
        address _factory,
        address _wusd
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        feeReceiver = _feeReceiver;
        factory = WorkQuestFactoryInterface(_factory);
        wusd = IERC20Upgradeable(_wusd);
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
    ) external nonReentrant {
        require(
            factory.workquestValid(quest),
            'WQPromotion: Quest is not WorkQuest contract'
        );
        require(questTariff[tariff][period] > 0, 'WQPromotion: Invalid tariff');
        wusd.safeTransferFrom(
            msg.sender,
            feeReceiver,
            questTariff[tariff][period]
        );
        emit PromotedQuest(
            quest,
            tariff,
            period,
            block.timestamp,
            questTariff[tariff][period]
        );
    }

    function promoteUser(PaidTariff tariff, uint256 period)
        external
        nonReentrant
    {
        require(usersTariff[tariff][period] > 0, 'WQPromotion: Invalid tariff');
        wusd.safeTransferFrom(
            msg.sender,
            feeReceiver,
            usersTariff[tariff][period]
        );
        emit PromotedUser(
            msg.sender,
            tariff,
            period,
            block.timestamp,
            usersTariff[tariff][period]
        );
    }

    /**
     * Admin Functions
     */

    /**
     * @dev Set address of workquest factory
     * @param _factory Address of token
     */
    function setFactory(address _factory) external onlyRole(ADMIN_ROLE) {
        factory = WorkQuestFactoryInterface(_factory);
    }

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
