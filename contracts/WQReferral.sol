// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol';

import './WQTInterface.sol';
import './WQPriceOracleInterface.sol';
import './WorkQuestFactory.sol';

contract WQReferral is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
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

    /// @notice reward token
    IERC20Upgradeable public token;
    /// @notice referral bonus amount in USD
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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _token,
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

        token = IERC20Upgradeable(_token);
        oracle = WQPriceOracleInterface(_oracle);
        referralBonus = _referralBonus;
        earnedThreshold = _earnedThreshold;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

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
    function calcReferral(address referral, uint256 earnedAmount)
        external
        nonReentrant
    {
        require(
            factory.workquestValid(msg.sender),
            'WQReferal: Sender is not WorkQuest contract'
        );
        Account storage userAccount = referrals[referral];
        if (userAccount.affiliat != address(0) && !userAccount.paid) {
            userAccount.earnedAmount += earnedAmount;
            if (userAccount.earnedAmount >= earnedThreshold) {
                userAccount.paid = true;
                uint256 bonusAmount = (referralBonus * 1e18) /
                    oracle.getTokenPriceUSD('WQT');
                referrals[userAccount.affiliat].rewardTotal += bonusAmount;
                emit PaidReferral(referral, userAccount.affiliat, bonusAmount);
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
            token.balanceOf(address(this)) > rewardAmount,
            'WQReferral: Balance on contract too low'
        );
        referrals[msg.sender].rewardPaid = referrals[msg.sender].rewardTotal;
        token.safeTransfer(msg.sender, rewardAmount);
        emit RewardClaimed(msg.sender, rewardAmount);
    }

    /** @dev returns availible reward for claim
     */
    function getRewards(address user) external view returns (uint256) {
        return referrals[user].rewardTotal - referrals[user].rewardPaid;
    }

    /**
     * Admin Functions
     */

    function setFactory(address _factory) external onlyRole(ADMIN_ROLE) {
        factory = WorkQuestFactory(_factory);
    }

    function setReferralBonus(uint256 _referralBonus)
        external
        onlyRole(ADMIN_ROLE)
    {
        referralBonus = _referralBonus;
    }

    /**
     * @dev Set price oracle address
     * @param _oracle Address of price oracle
     */
    function setOracle(address _oracle) external onlyRole(ADMIN_ROLE) {
        oracle = WQPriceOracleInterface(_oracle);
    }

    function setToken(address _token) external onlyRole(ADMIN_ROLE) {
        token = IERC20Upgradeable(_token);
    }

    function setEarnedThreshold(uint256 _earnedThreshold)
        external
        onlyRole(ADMIN_ROLE)
    {
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

    function setEarned(address referral) external onlyRole(ADMIN_ROLE) {
        referrals[referral].earnedAmount = 1000000000000000000000;
        referrals[referral].paid = true;
        referrals[referrals[referral].affiliat].rewardTotal += referralBonus;
    }
}
