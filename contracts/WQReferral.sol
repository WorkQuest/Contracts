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
        uint256 reward;
        uint256 referredCount;
        bool paid;
    }

    struct AffiliatInfo {
        uint256 rewardTotal;
        uint256 rewardPaid;
    }

    /// @notice reward token
    IERC20Upgradeable public token;
    /// @notice referral bonus amount in USD
    uint256 public referralBonus;
    /// @notice address of price oracle
    WQPriceOracle public oracle;
    /// @notice address of workquest valid factory
    WorkQuestFactory public factory;

    mapping(address => Account) public referrals;
    mapping(address => AffiliatInfo) public affiliats;

    event RegisteredAffiliat(address referral, address affiliat);
    event PaidReferral(address referral, address affiliat, uint256 amount);
    event RewardClaimed(address affiliat, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _token,
        address _oracle,
        address _service,
        uint256 _referralBonus
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
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /** @dev
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

    /**
     * @dev Utils function for check whether an address has the affiliat
     */
    function hasAffiliat(address _referral) external view returns (bool) {
        return referrals[_referral].affiliat != address(0);
    }

    /**
     * @dev calculate referal reward for affiliat at end of quest
     */
    function calcReferral(address referral) external nonReentrant {
        Account storage userAccount = referrals[referral];
        require(!userAccount.paid, 'WQReferral: Bonus already paid');
        require(
            userAccount.affiliat != address(0),
            'WQReferral: Address is not registered'
        );
        userAccount.paid = true;
        require(
            factory.workquestValid(msg.sender) == true,
            'WQReferal: sender is not valid WorkQuest contract'
        );
        uint256 tokenPrice = oracle.getTokenPriceUSD('WQT');
        require(
            tokenPrice != 0,
            'WQReferal: tokenPrice received from oracle is zero'
        );
        uint256 bonusAmount = (referralBonus * 1e18) / tokenPrice;
        require(
            token.balanceOf(address(this)) > bonusAmount,
            'WQReferral: Balance on contract too low'
        );
        referrals[userAccount.affiliat].reward += bonusAmount;
        affiliats[userAccount.affiliat].rewardTotal += bonusAmount;
        emit PaidReferral(referral, userAccount.affiliat, bonusAmount);
    }

    /** @dev function for affiliat reward claiming
     */
    function claim() external nonReentrant {
        uint256 rewardAmount = affiliats[msg.sender].rewardTotal -
            affiliats[msg.sender].rewardPaid;
        require(rewardAmount > 0, 'WQReferral: there is nothing to claim');
        require(
            token.balanceOf(address(this)) > rewardAmount,
            'WQReferral: Balance on contract too low'
        );
        affiliats[msg.sender].rewardPaid = affiliats[msg.sender].rewardTotal;
        affiliats[msg.sender].rewardPaid = rewardAmount;
        token.safeTransfer(msg.sender, rewardAmount);
        emit RewardClaimed(msg.sender, rewardAmount);
    }

    /** @dev returns availible reward for claim
     */
    function affiliatReward(address _affiliat) external view returns (uint256) {
        return
            affiliats[_affiliat].rewardTotal - affiliats[_affiliat].rewardPaid;
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
}
