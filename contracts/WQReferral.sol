// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol';
import './stablecoin/WQPriceOracleInterface.sol';
import './WorkQuestFactory.sol';

contract WQReferral is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using AddressUpgradeable for address payable;
    using ECDSAUpgradeable for bytes32;

    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant SERVICE_ROLE = keccak256('SERVICE_ROLE');

    /// @notice referral - someone who done job and paid to affiliate
    /// @notice affiliate - person who get reward from referrals
    /**
     * @dev The struct of account information
     * @param affiliat The affiliate addresss
     * @param reward The total referral reward of an address
     * @param referredCount The total referral amount of an address
     * @param lastActiveTimestamp The last active timestamp of an address
     */
    struct Account {
        address affiliat;
        uint256 earnedAmount;
        uint256 rewardTotal;
        uint256 rewardPaid;
        uint256 referredCount;
        bool paid;
    }

    /// @notice referral bonus amount in USDT
    uint256 public referralBonus;
    /// @notice address of price oracle
    WQPriceOracleInterface public oracle;
    /// @notice address of workquest valid factory
    WorkQuestFactory public factory;
    /// @notice Threshold of earned amount when reward paid
    uint256 public earnedThreshold;

    mapping(address => Account) public referrals;

    event RegisteredAffiliat(address referral, address affiliate);
    event PaidReferral(address referral, address affiliate, uint256 amount);
    event RewardClaimed(address affiliate, uint256 amount);
    event Received(uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _oracle,
        address _service,
        uint256 _referralBonus,
        uint256 _earnedThreshold
    ) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setupRole(SERVICE_ROLE, _service);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(SERVICE_ROLE, ADMIN_ROLE);

        oracle = WQPriceOracleInterface(_oracle);
        referralBonus = _referralBonus;
        earnedThreshold = _earnedThreshold;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}

    receive() external payable {
        emit Received(msg.value);
    }

    /**
     * @dev Add addresses of referral by affiliate
     */
    function addReferrals(
        uint8 v,
        bytes32 r,
        bytes32 s,
        address[] calldata referral
    ) external {
        require(
            hasRole(
                SERVICE_ROLE,
                keccak256(abi.encodePacked(msg.sender, referral))
                    .toEthSignedMessageHash()
                    .recover(v, r, s)
            ),
            'WQReferal: validator is not a service'
        );

        for (uint256 i = 0; i < referral.length; i++) {
            require(
                referral[i] != address(0),
                'WQReferral: affiliate cannot be zero address'
            );
            require(
                referral[i] != msg.sender,
                'WQReferral: affiliate cannot be sender address'
            );
            require(
                referrals[referral[i]].affiliat == address(0),
                'WQReferral: Address is already registered'
            );
            referrals[referral[i]].affiliat = msg.sender;
            referrals[msg.sender].referredCount++;
            emit RegisteredAffiliat(referral[i], msg.sender);
        }
    }

    /**
     * @dev calculate referal reward for affiliate at end of quest
     */
    function calcReferral(
        address referral,
        uint256 earnedAmount
    ) external nonReentrant {
        require(
            factory.workquestValid(msg.sender),
            'WQReferal: Sender is not WorkQuest contract'
        );

        Account storage userAccount = referrals[referral];
        if (userAccount.affiliat != address(0) && !userAccount.paid) {
            userAccount.earnedAmount += earnedAmount;
            if (((userAccount.earnedAmount) * 1e12) >= earnedThreshold) {
                userAccount.paid = true;
                referrals[userAccount.affiliat].rewardTotal += referralBonus;
                emit PaidReferral(
                    referral,
                    userAccount.affiliat,
                    referralBonus
                );
            }
        }
    }

    /** @dev function for affiliate reward claiming
     */
    function claim() external nonReentrant {
        uint256 rewardAmount = referrals[msg.sender].rewardTotal -
            referrals[msg.sender].rewardPaid;
        require(rewardAmount > 0, 'WQReferral: there is nothing to claim');
        require(
            address(this).balance > rewardAmount,
            'WQReferral: Balance on contract too low'
        );
        uint256 bonusAmount = (rewardAmount * 1e18) /
            oracle.getTokenPriceUSD('WQT');
        referrals[msg.sender].rewardPaid = referrals[msg.sender].rewardTotal;
        payable(msg.sender).sendValue(bonusAmount);
        emit RewardClaimed(msg.sender, bonusAmount);
    }

    /** @dev returns availible reward for claim
     */
    function getRewards(address user) external view returns (uint256) {
        return referrals[user].rewardTotal - referrals[user].rewardPaid;
    }

    /**
     * Admin Functions
     */
    /**
     * @dev Set address of workquest factory
     * @param _factory Address of workquest factory
     */
    function setFactory(address _factory) external onlyRole(ADMIN_ROLE) {
        factory = WorkQuestFactory(_factory);
    }

    /**
     * @dev Set price oracle address
     * @param _oracle Address of price oracle
     */
    function setOracle(address _oracle) external onlyRole(ADMIN_ROLE) {
        oracle = WQPriceOracleInterface(_oracle);
    }

    /**
     * @dev Set reward value for each referral
     * @param _referralBonus Referral bonus value
     */
    function setReferralBonus(
        uint256 _referralBonus
    ) external onlyRole(ADMIN_ROLE) {
        referralBonus = _referralBonus;
    }

    /**
     * @dev Set threshold of earned funds, when rewards payed
     * @param _earnedThreshold Threshold value
     */
    function setEarnedThreshold(
        uint256 _earnedThreshold
    ) external onlyRole(ADMIN_ROLE) {
        earnedThreshold = _earnedThreshold;
    }

    function delAffiliate(address referral) external onlyRole(ADMIN_ROLE) {
        Account storage userAccount = referrals[referral];
        userAccount.affiliat = address(0);
        userAccount.earnedAmount = 0;
        userAccount.rewardTotal = 0;
        userAccount.rewardPaid = 0;
        userAccount.referredCount = 0;
        userAccount.paid = false;
    }
}
