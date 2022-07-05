// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol';
import './WQPriceOracleInterface.sol';
import './WQRouterVault.sol';
import './WQCollateralAuction.sol';
import './WQSurplusAuction.sol';
import './WQDebtAuction.sol';
import '../WQBridgeTokenInterface.sol';

contract WQRouter is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address payable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');
    uint256 constant YEAR = 31536000;

    struct UserCollateral {
        uint256 collateralAmount;
        WQRouterVault vault;
        EnumerableSetUpgradeable.UintSet lots;
    }

    /**
     * @dev Settings of collateral token
     */
    struct TokenSettings {
        uint256 totalCollateral;
        uint256 totalDebt;
        address token;
        WQCollateralAuction collateralAuction;
        uint256 minRatio;
        bool enabled;
    }

    WQPriceOracleInterface oracle;
    WQBridgeTokenInterface wusd;
    WQSurplusAuction surplusAuction;
    WQDebtAuction debtAuction;

    /**
     * @notice Stability fee settings
     */
    uint256 public fixedRate;
    uint256 public annualInterestRate;
    uint256 public buyerRewards;
    address feeReceiver;

    mapping(string => TokenSettings) public tokens;
    mapping(string => mapping(address => UserCollateral)) private collaterals;

    /**
     * @dev Event emitted when user deposited colateral tokens and takes WUSD
     * @param user Address of user
     * @param collateral Collateral amount of tokens (ETH, BNB, etc.)
     * @param debt Given amount of WUSD
     * @param price Current price of collateral token
     * @param index index value of lot on auction
     * @param symbol Symbol of collateral token
     */
    event Produced(
        address user,
        uint256 collateral,
        uint256 ratio,
        uint256 debt,
        uint256 price,
        uint256 index,
        string symbol
    );

    /**
     * @dev Event emitted when user claimed extra debt, disposed debt, added collateral or called service function moveUserLot
     * @param collateral Collateral amount of tokens (ETH, BNB, etc.)
     * @param price Current price of collateral token
     * @param oldIndex old index value of lot on auction
     * @param newIndex new index value of lot on auction
     * @param symbol Symbol of collateral token
     */
    event Moved(
        uint256 collateral,
        uint256 price,
        uint256 oldIndex,
        uint256 newIndex,
        string symbol
    );

    /**
     * @dev Event emitted when user liquidated part of collateral or lot is partially selled
     * @param user Address of user
     * @param collateral Amount of given tokens (ETH, BNB, etc.)
     * @param debt Amount of payed WUSD
     * @param index index value of lot on auction
     * @param symbol Symbol of collateral token
     */
    event Removed(
        address user,
        uint256 collateral,
        uint256 debt,
        uint256 price,
        uint256 index,
        string symbol
    );

    /**
     * @dev Service event, emitted when contract received WUSD
     */
    event Received(uint256 amount);

    modifier onlyEnabledToken(string calldata symbol) {
        require(tokens[symbol].enabled, 'WQRouter: Token diabled');
        _;
    }

    modifier onlyCollateralAuction(string calldata symbol) {
        require(
            msg.sender == address(tokens[symbol].collateralAuction),
            'WQRouter: Only collateral auction'
        );
        _;
    }

    modifier onlySurplusAuction() {
        require(
            msg.sender == address(surplusAuction),
            'WQRouter: Only surplus auction'
        );
        _;
    }

    modifier onlyDebtAuction() {
        require(
            msg.sender == address(debtAuction),
            'WQRouter: Only debt auction'
        );
        _;
    }

    function isLotExist(uint256 index, string calldata symbol) internal view {
        UserCollateral storage userCollateral = collaterals[symbol][msg.sender];
        require(userCollateral.lots.contains(index), 'WQRouter: Lot not found');
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _oracle,
        address _wusd,
        uint256 _fixedRate,
        uint256 _annualInterestRate,
        address _feeReceiver
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        oracle = WQPriceOracleInterface(_oracle);
        wusd = WQBridgeTokenInterface(_wusd);
        fixedRate = _fixedRate;
        annualInterestRate = _annualInterestRate;
        feeReceiver = _feeReceiver;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    receive() external payable {
        emit Received(msg.value);
    }

    /**
     * @dev Deposit colateral tokens and take WUSD
     * @dev amount of WUSD = collateralAmount * price / collateralRatio
     * @param collateralAmount amount of collateral tokens
     * @param collateralRatio Collateral ratio value
     * @param symbol Symbol of collateral token
     */
    function produceWUSD(
        uint256 collateralAmount,
        uint256 collateralRatio,
        string calldata symbol
    ) external nonReentrant onlyEnabledToken(symbol) {
        require(
            collateralRatio >= tokens[symbol].minRatio &&
                collateralRatio <= oracle.getTokenMaxRatio(symbol),
            'WQRouter: Invalid collateral ratio'
        );
        {
            uint256 price = oracle.getTokenPriceUSD(symbol);
            if (
                collaterals[symbol][msg.sender].vault ==
                WQRouterVault(address(0))
            ) {
                collaterals[symbol][msg.sender].vault = new WQRouterVault(
                    msg.sender
                );
            }
            collaterals[symbol][msg.sender]
                .collateralAmount += collateralAmount;
            tokens[symbol].totalCollateral += collateralAmount;

            uint256 debtAmount = (collateralAmount *
                price *
                (10 **
                    (18 -
                        IERC20MetadataUpgradeable(tokens[symbol].token)
                            .decimals()))) / collateralRatio;
            tokens[symbol].totalDebt += debtAmount;

            //Add lot to collateralAuction
            uint256 index = tokens[symbol].collateralAuction.addLot(
                msg.sender,
                price,
                collateralAmount,
                collateralRatio
            );
            // Save indexes of lot
            collaterals[symbol][msg.sender].lots.add(index);

            // Take tokens
            IERC20Upgradeable(tokens[symbol].token).safeTransferFrom(
                msg.sender,
                address(collaterals[symbol][msg.sender].vault),
                collateralAmount
            );

            // Send wusd
            wusd.mint(msg.sender, debtAmount);
            emit Produced(
                msg.sender,
                collateralAmount,
                collateralRatio,
                debtAmount,
                price,
                index,
                symbol
            );
        }
    }

    /**
     * @dev User claimed extra debt when price of collateral is increased
     * @dev The price of the lot at the collateralAuction also increases to increase the risk of liquidation
     * @param index index of lot
     * @param symbol Symbol of token
     */
    function claimExtraDebt(uint256 index, string calldata symbol)
        external
        nonReentrant
        onlyEnabledToken(symbol)
    {
        isLotExist(index, symbol);
        uint256 price = oracle.getTokenPriceUSD(symbol);
        uint256 newIndex;
        uint256 lotAmount;
        {
            uint256 lotPrice;
            uint256 collateralRatio;
            (lotAmount, lotPrice, collateralRatio, , ) = tokens[symbol]
                .collateralAuction
                .getLotInfo(index);
            require(
                tokens[symbol].collateralAuction.getLotStatus(index) ==
                    uint8(1),
                'WQRouter: Status not new'
            );
            uint256 extraDebt = ((price - lotPrice) *
                lotAmount *
                10 **
                    (18 -
                        IERC20MetadataUpgradeable(tokens[symbol].token)
                            .decimals())) / collateralRatio;

            tokens[symbol].totalDebt += extraDebt;
            wusd.mint(msg.sender, extraDebt);
            newIndex = tokens[symbol].collateralAuction.moveLot(
                index,
                price,
                lotAmount
            );
            collaterals[symbol][msg.sender].lots.remove(index);
            collaterals[symbol][msg.sender].lots.add(newIndex);
        }
        emit Moved(lotAmount, price, index, newIndex, symbol);
    }

    /**
     * @dev User disposed debt when price of collateral is decreased
     * @dev The price of the lot at the collateralAuction also decreases to decrease the risk of liquidation
     * @param index index of lot
     * @param symbol Symbol of token
     */
    function disposeDebt(uint256 index, string calldata symbol)
        external
        nonReentrant
        onlyEnabledToken(symbol)
    {
        isLotExist(index, symbol);
        uint256 newIndex;
        uint256 price = oracle.getTokenPriceUSD(symbol);
        uint256 lotAmount;
        {
            uint256 lotPrice;
            uint256 collateralRatio;
            (lotAmount, lotPrice, collateralRatio, , ) = tokens[symbol]
                .collateralAuction
                .getLotInfo(index);
            require(
                tokens[symbol].collateralAuction.getLotStatus(index) ==
                    uint8(1),
                'WQRouter: Status not new'
            );
            uint256 returnDebt = ((lotPrice - price) *
                lotAmount *
                10 **
                    (18 -
                        IERC20MetadataUpgradeable(tokens[symbol].token)
                            .decimals())) / collateralRatio;
            tokens[symbol].totalDebt -= returnDebt;
            newIndex = tokens[symbol].collateralAuction.moveLot(
                index,
                price,
                lotAmount
            );
            collaterals[symbol][msg.sender].lots.remove(index);
            collaterals[symbol][msg.sender].lots.add(newIndex);
            wusd.burn(msg.sender, returnDebt);
        }
        emit Moved(lotAmount, price, index, newIndex, symbol);
    }

    /**
     * @dev User add collateral when price of collateral is decreased
     * @dev The price of the lot at the collateralAuction also decreases to decrease the risk of liquidation
     * @param index index of lot
     * @param symbol Symbol of token
     */
    function addCollateral(uint256 index, string calldata symbol)
        external
        nonReentrant
        onlyEnabledToken(symbol)
    {
        isLotExist(index, symbol);
        uint256 newIndex;
        uint256 price = oracle.getTokenPriceUSD(symbol);
        uint256 lotAmount;
        uint256 addedCollateral;
        {
            uint256 lotPrice;
            (lotAmount, lotPrice, , , ) = tokens[symbol]
                .collateralAuction
                .getLotInfo(index);
            require(
                tokens[symbol].collateralAuction.getLotStatus(index) ==
                    uint8(1),
                'WQRouter: Status not new'
            );
            addedCollateral = (lotPrice * lotAmount) / price - lotAmount;
            tokens[symbol].totalCollateral += addedCollateral;
            collaterals[symbol][msg.sender].collateralAmount += addedCollateral;
            newIndex = tokens[symbol].collateralAuction.moveLot(
                index,
                price,
                lotAmount + addedCollateral
            );
            collaterals[symbol][msg.sender].lots.remove(index);
            collaterals[symbol][msg.sender].lots.add(newIndex);
            IERC20Upgradeable(tokens[symbol].token).safeTransferFrom(
                msg.sender,
                address(collaterals[symbol][msg.sender].vault),
                addedCollateral
            );
        }
        emit Moved(lotAmount + addedCollateral, price, index, newIndex, symbol);
    }

    /**
     * @dev Partial liquidate of a collateral.
     * @dev User gives WUSD (debeted WUSD + comission) and takes part of collateral tokens
     * @param index index of lot
     * @param debtPart Amount of liquidated part of debt
     * @param symbol Symbol of token
     */
    function removeCollateral(
        uint256 index,
        uint256 debtPart,
        string calldata symbol
    ) external nonReentrant onlyEnabledToken(symbol) {
        isLotExist(index, symbol);
        uint256 collateralPart;
        uint256 price;
        {
            uint256 collateralRatio;
            uint256 createdAt;
            (, price, collateralRatio, createdAt, ) = tokens[symbol]
                .collateralAuction
                .getLotInfo(index);
            require(
                tokens[symbol].collateralAuction.getLotStatus(index) ==
                    uint8(1),
                'WQRouter: Status not new'
            );

            collateralPart =
                (debtPart * collateralRatio) /
                price /
                10 **
                    (18 -
                        IERC20MetadataUpgradeable(tokens[symbol].token)
                            .decimals());
            tokens[symbol].totalDebt -= debtPart;
            tokens[symbol].totalCollateral -= collateralPart;
            UserCollateral storage userCollateral = collaterals[symbol][
                msg.sender
            ];
            userCollateral.collateralAmount -= collateralPart;
            uint256 remain = tokens[symbol].collateralAuction.decreaseLotAmount(
                index,
                collateralPart
            );
            if (remain == 0) {
                collaterals[symbol][msg.sender].lots.remove(index);
            }

            //Return change
            //Transfer collateral token
            userCollateral.vault.transfer(
                payable(msg.sender),
                collateralPart,
                tokens[symbol].token
            );
            userCollateral.vault.transfer(
                payable(feeReceiver),
                (collateralPart *
                    (fixedRate +
                        (annualInterestRate * (block.timestamp - createdAt)) /
                        YEAR)) / 1e18,
                tokens[symbol].token
            );
            wusd.burn(msg.sender, debtPart);
        }
        emit Removed(
            msg.sender,
            collateralPart,
            debtPart,
            price,
            index,
            symbol
        );
    }

    function moveUserLot(
        address user,
        uint256 collateral,
        uint256 price,
        uint256 index,
        uint256 newIndex,
        string calldata symbol
    ) external onlyCollateralAuction(symbol) {
        collaterals[symbol][user].lots.remove(index);
        collaterals[symbol][user].lots.add(newIndex);
        emit Moved(collateral, price, index, newIndex, symbol);
    }

    /**
     * @dev Get list of indexes in Auction of user lots
     * @param user address of user
     * @param offset Offset value
     * @param limit Limit value
     */
    function getUserLots(
        address user,
        uint256 offset,
        uint256 limit,
        string calldata symbol
    ) external view returns (uint256[] memory page) {
        EnumerableSetUpgradeable.UintSet storage lots = collaterals[symbol][
            user
        ].lots;
        if (limit > lots.length() - offset) {
            limit = lots.length() - offset;
        }
        page = new uint256[](limit);
        for (uint256 i = 0; i < limit; i++) {
            page[i] = lots.at(offset + i);
        }
        return page;
    }

    /**
     * @dev Service function for collateral auctions
     * @dev Called when lot is selled on auction
     */
    //FIXME: add isLotExist?
    function buyCollateral(
        address buyer,
        uint256 index,
        uint256 amount,
        uint256 fee,
        string calldata symbol
    ) external nonReentrant onlyCollateralAuction(symbol) {
        uint256 collateralPart;
        uint256 lotPrice;
        uint256 collateralRatio;
        address owner;
        (, lotPrice, collateralRatio, , collateralPart) = tokens[symbol]
            .collateralAuction
            .getLotInfo(index);
        owner = tokens[symbol].collateralAuction.getLotUsers(index);
        collaterals[symbol][owner].collateralAmount -= collateralPart;
        tokens[symbol].totalCollateral -= collateralPart;
        tokens[symbol].totalDebt -= amount;
        collaterals[symbol][owner].vault.transfer(
            payable(buyer),
            collateralPart,
            tokens[symbol].token
        );
        // Comission
        collaterals[symbol][owner].vault.transfer(
            payable(feeReceiver),
            fee,
            tokens[symbol].token
        );
        wusd.burn(buyer, amount);
        emit Removed(owner, collateralPart, 0, 0, index, symbol);
    }

    function getCollateral(string calldata symbol)
        external
        view
        returns (uint256 amount)
    {
        return tokens[symbol].totalCollateral;
    }

    function getDebt(string calldata symbol)
        external
        view
        returns (uint256 amount)
    {
        return tokens[symbol].totalDebt;
    }

    function getParams()
        external
        view
        returns (
            WQPriceOracleInterface,
            WQBridgeTokenInterface,
            WQSurplusAuction,
            WQDebtAuction,
            uint256,
            uint256,
            address
        )
    {
        return (
            oracle,
            wusd,
            surplusAuction,
            debtAuction,
            fixedRate,
            annualInterestRate,
            feeReceiver
        );
    }

    /**
     * @dev Transfer WQT from user and mint him WUSD
     */
    function transferSurplus(
        address user,
        uint256 amount,
        string calldata symbol
    ) external payable onlySurplusAuction {
        tokens[symbol].totalDebt += amount;
        wusd.mint(user, amount);
    }

    /**
     * @dev Burn WUSD from user and send him WQT
     */
    function transferDebt(
        address user,
        uint256 amount,
        uint256 cost,
        string calldata symbol
    ) external onlyDebtAuction {
        tokens[symbol].totalDebt -= cost;
        wusd.burn(user, cost);
        payable(user).sendValue(amount);
    }

    /** Admin Functions */

    /**
     * @dev Set address of price oracle contract
     * @param _oracle Address of oracle
     */
    function setContracts(
        address _oracle,
        address debt_auction,
        address surplus_auction
    ) external onlyRole(ADMIN_ROLE) {
        oracle = WQPriceOracleInterface(_oracle);
        debtAuction = WQDebtAuction(debt_auction);
        surplusAuction = WQSurplusAuction(surplus_auction);
    }

    /**
     * @dev Update settings of token
     * @param symbol Symbol of token
     * @param auction Address of collateral auction
     * @param enabled Token disabled/enabled flag
     */
    function setToken(
        bool enabled,
        address token,
        address auction,
        uint256 minRatio,
        string calldata symbol
    ) external onlyRole(ADMIN_ROLE) {
        tokens[symbol].token = token;
        tokens[symbol].collateralAuction = WQCollateralAuction(auction);
        tokens[symbol].enabled = enabled;
        tokens[symbol].minRatio = minRatio;
    }

    /**
     * @dev Set fixed rate value value
     * @param _fixedRate Fixed rate value
     */
    function setRate(
        uint256 _fixedRate,
        uint256 _annualInterestRate,
        uint256 _buyerRewards
    ) external onlyRole(ADMIN_ROLE) {
        fixedRate = _fixedRate;
        annualInterestRate = _annualInterestRate;
        buyerRewards = _buyerRewards;
    }

    /**
     * @dev Set stability fee value
     * @param _feeReceiver Address of fee receiver
     */
    function setFeeReceiver(address _feeReceiver)
        external
        onlyRole(ADMIN_ROLE)
    {
        feeReceiver = _feeReceiver;
    }
}
