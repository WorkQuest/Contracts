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
import './WQPriceOracle.sol';
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

    /// @notice referral - someone who done job and paid to affiliat
    /// @notice affiliat - person who get reward from referrals
    /**
     * @dev The struct of account information
     * @param affiliat The affiliat addresss
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
    WQPriceOracle public oracle;
    /// @notice address of workquest valid factory
    WorkQuestFactory public factory;
    /// @notice Threshold of earned amount when reward paid
    uint256 public earnedThreshold;

    mapping(address => Account) public referrals;

    event RegisteredAffiliat(address referral, address affiliat);
    event PaidReferral(address referral, address affiliat, uint256 amount);
    event RewardClaimed(address affiliat, uint256 amount);
    event Received(uint256 amount);

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
        oracle = WQPriceOracle(_oracle);
        referralBonus = _referralBonus;
        earnedThreshold = _earnedThreshold;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @dev Add affiliat address by service confirmed
     */
    function addAffiliat(
        uint8 v,
        bytes32 r,
        bytes32 s,
        address _affiliat
    ) external {
        require(
            _affiliat != address(0),
            'WQReferral: affiliat cannot be zero address'
        );
        require(
            _affiliat != msg.sender,
            'WQReferral: affiliat cannot be sender address'
        );
        require(
            referrals[msg.sender].affiliat == address(0),
            'WQReferral: Address is already registered'
        );
        require(
            hasRole(
                SERVICE_ROLE,
                keccak256(abi.encodePacked(_affiliat, msg.sender))
                    .toEthSignedMessageHash()
                    .recover(v, r, s)
            ),
            'WQReferal: validator is not a service'
        );
        referrals[msg.sender].affiliat = _affiliat;
        referrals[_affiliat].referredCount++;

        emit RegisteredAffiliat(msg.sender, _affiliat);
    }

    receive() external payable {
        emit Received(msg.value);
    }

    /**
     * @dev calculate referal reward for affiliat at end of quest
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

    /** @dev function for affiliat reward claiming
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
    function affiliatReward(address _affiliat) external view returns (uint256) {
        return
            referrals[_affiliat].rewardTotal - referrals[_affiliat].rewardPaid;
    }

    /** Admin Functions */

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
        oracle = WQPriceOracle(_oracle);
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
}
