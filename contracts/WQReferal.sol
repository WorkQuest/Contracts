// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';

import './WQTInterface.sol';
import './WQPriceOracle.sol';

contract WQReferral is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

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

    IERC20Upgradeable token;
    uint256 referralBonus;
    /// @notice address of price oracle
    address public oracle;

    mapping(address => Account) public referrals;
    mapping(address => AffiliatInfo) public affiliats;

    event RegisteredAffiliat(address referral, address affiliat);
    event PaidReferral(address referral, address affiliat, uint256 amount);
    event RewardClaimed(address affiliat, uint256 amount);

    function initialize(
        address _token,
        address _oracle,
        uint256 _referralBonus
    ) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);

        token = IERC20Upgradeable(_token);
        oracle = _oracle;
        referralBonus = _referralBonus;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /** @dev
     */
    function addAffiliat(address _affiliat) external {
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
        referrals[msg.sender].affiliat = _affiliat;
        referrals[_affiliat].referredCount++;

        emit RegisteredAffiliat(msg.sender, _affiliat);
    }

    /**
     * @dev Utils function for check whether an address has the affiliat
     */
    function hasAffiliat(address _referral)
        external
        view
        returns (bool hasAffiliat_)
    {
        hasAffiliat_ = referrals[_referral].affiliat != address(0);
        return hasAffiliat_;
    }

    /**
     * @dev Pay referral to registered affiliat
     */
    function payReferral(address referral) external nonReentrant {
        uint256 tokenPrice = WQPriceOracle(oracle).getTokenPriceUSD();
        require(
            tokenPrice != 0,
            'WQReferal: tokenPrice received from oracle is zero'
        );
        uint256 bonusAmount = referralBonus / tokenPrice;
        require(
            token.balanceOf(address(this)) > bonusAmount,
            'WQReferral: Balance on contract too low'
        );
        Account storage userAccount = referrals[referral];
        require(!userAccount.paid, 'WQReferral: Bonus already paid');
        require(
            userAccount.affiliat != address(0),
            'WQReferral: Address is not registered'
        );
        userAccount.paid = true;
        referrals[userAccount.affiliat].reward += bonusAmount;
        affiliats[userAccount.affiliat].rewardTotal += bonusAmount;
        // token.safeTransfer(userAccount.affiliat, bonusAmount);
        emit PaidReferral(referral, userAccount.affiliat, bonusAmount);
    }

    /** @dev function for affiliat reward claiming 
     */
    function claim() external nonReentrant {
        uint256 rewardAmount = affiliats[msg.sender].rewardTotal - affiliats[msg.sender].rewardPaid;
        require(
            rewardAmount > 0,
            "WQReferral: there is nothing to claim"
        );
        require(
            token.balanceOf(address(this)) > bonusAmount,
            'WQReferral: Balance on contract too low'
        );
        affiliats[msg.sender].rewardPaid = rewardTotal;
        token.safeTransfer(msg.sender, rewardAmount);
        emit RewardClaimed(msg.sender, rewardAmount);
    }

    /** @dev returns availible reward for claim 
     */
    function affiliatReward(address _affiliat) external view returns (uint256) {
        return affiliats[_affiliat].rewardTotal - affiliats[_affiliat].rewardPaid;
    } 

}
