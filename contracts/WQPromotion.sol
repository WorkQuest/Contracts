// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import './WorkQuestFactory.sol';

contract WQPromotion is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using AddressUpgradeable for address payable;
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    enum PaidTariff {
        Free,
        Bronze,
        Silver,
        Gold,
        GoldPlus
    }

    /// @notice Address of the fee receiver
    address payable public feeReceiver;
    WorkQuestFactory public factory;
    mapping(PaidTariff => mapping(uint256 => uint256)) public questTariff;
    mapping(PaidTariff => mapping(uint256 => uint256)) public usersTariff;

    event Promoted(
        address user,
        PaidTariff tariff,
        uint256 period,
        uint256 promotedAt
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(address payable _feeReceiver, address _factory)
        external
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
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    function promote(
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
        emit Promoted(quest, tariff, period, block.timestamp);
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
        emit Promoted(msg.sender, tariff, period, block.timestamp);
    }

    /**
     * Admin Functions
     */

    function setFactory(address _factory) external onlyRole(ADMIN_ROLE) {
        factory = WorkQuestFactory(_factory);
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
