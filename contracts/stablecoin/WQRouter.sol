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
        WQRouterVault vault;
        EnumerableSetUpgradeable.UintSet lots;
    }

    /**
     * @dev Settings of collateral token
     */
    struct TokenSettings {
        address token;
        WQCollateralAuction collateralAuction;
        uint256 minRatio;
        bool enabled;
    }

    WQPriceOracleInterface oracle;
    WQBridgeTokenInterface wusd;
    address payable feeReceiver;

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
     * @param index index of lot on auction
     * @param newIndex new index of lot on auction
     * @param symbol Symbol of collateral token
     */
    event Moved(
        uint256 collateral,
        uint256 debt,
        uint256 price,
        uint256 index,
        uint256 newIndex,
        uint8 status,
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
        uint256 ratio,
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

    modifier onlyCollateralAuction(string memory symbol) {
        require(
            msg.sender == address(tokens[symbol].collateralAuction),
            'WQRouter: Only collateral auction'
        );
        _;
    }

    function isLotExist(uint256 index, string calldata symbol) internal view {
        require(
            collaterals[symbol][msg.sender].lots.contains(index),
            'WQRouter: Lot not found'
        );
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _oracle,
        address _wusd,
        address payable _feeReceiver
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
        uint256 price = oracle.getTokenPriceUSD(symbol);
        if (
            collaterals[symbol][msg.sender].vault == WQRouterVault(address(0))
        ) {
            collaterals[symbol][msg.sender].vault = new WQRouterVault(
                msg.sender
            );
        }

        uint256 debtAmount = (collateralAmount *
            price *
            (10 **
                (18 -
                    IERC20MetadataUpgradeable(tokens[symbol].token)
                        .decimals()))) / collateralRatio;

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
        (uint256 lotAmount, uint256 lotPrice, uint256 collateralRatio) = tokens[
            symbol
        ].collateralAuction.getLotInfo(index);
        require(
            tokens[symbol].collateralAuction.getLotStatus(index) == uint8(1),
            'WQRouter: Status not new'
        );
        uint256 extraDebt = ((price - lotPrice) *
            lotAmount *
            10 **
                (18 -
                    IERC20MetadataUpgradeable(tokens[symbol].token)
                        .decimals())) / collateralRatio;

        wusd.mint(msg.sender, extraDebt);
        tokens[symbol].collateralAuction.moveLot(index, price, lotAmount);
        emit Moved(
            lotAmount,
            (lotAmount *
                price *
                10 **
                    (18 -
                        IERC20MetadataUpgradeable(tokens[symbol].token)
                            .decimals())) / collateralRatio,
            price,
            index,
            index,
            0,
            symbol
        );
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
        uint256 price = oracle.getTokenPriceUSD(symbol);
        (uint256 lotAmount, uint256 lotPrice, uint256 collateralRatio) = tokens[
            symbol
        ].collateralAuction.getLotInfo(index);
        require(
            tokens[symbol].collateralAuction.getLotStatus(index) == uint8(1),
            'WQRouter: Status not new'
        );
        uint256 returnDebt = ((lotPrice - price) *
            lotAmount *
            10 **
                (18 -
                    IERC20MetadataUpgradeable(tokens[symbol].token)
                        .decimals())) / collateralRatio;
        tokens[symbol].collateralAuction.moveLot(index, price, lotAmount);
        wusd.burn(msg.sender, returnDebt);
        emit Moved(
            lotAmount,
            (lotAmount *
                price *
                10 **
                    (18 -
                        IERC20MetadataUpgradeable(tokens[symbol].token)
                            .decimals())) / collateralRatio,
            price,
            index,
            index,
            1,
            symbol
        );
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
        uint256 price = oracle.getTokenPriceUSD(symbol);

        (uint256 lotAmount, uint256 lotPrice, uint256 collateralRatio) = tokens[
            symbol
        ].collateralAuction.getLotInfo(index);
        require(
            tokens[symbol].collateralAuction.getLotStatus(index) == uint8(1),
            'WQRouter: Status not new'
        );
        uint256 addedCollateral = (lotPrice * lotAmount) / price - lotAmount;
        tokens[symbol].collateralAuction.moveLot(
            index,
            price,
            lotAmount + addedCollateral
        );
        IERC20Upgradeable(tokens[symbol].token).safeTransferFrom(
            msg.sender,
            address(collaterals[symbol][msg.sender].vault),
            addedCollateral
        );

        emit Moved(
            lotAmount + addedCollateral,
            (lotPrice *
                lotAmount *
                10 **
                    (18 -
                        IERC20MetadataUpgradeable(tokens[symbol].token)
                            .decimals())) / collateralRatio,
            price,
            index,
            index,
            2,
            symbol
        );
    }

    /**
     * @dev Partial liquidate of a collateral.
     * @dev User gives WUSD and takes part of collateral tokens
     * @param index index of lot
     * @param debtPart Amount of part of debt
     * @param symbol Symbol of token
     */
    function removeCollateral(
        uint256 index,
        uint256 debtPart,
        string calldata symbol
    ) external nonReentrant onlyEnabledToken(symbol) {
        isLotExist(index, symbol);
        uint256 price;
        uint256 collateral;
        uint256 collateralRatio;
        uint256 factor = (10 **
            (18 - IERC20MetadataUpgradeable(tokens[symbol].token).decimals()));
        {
            (collateral, price, collateralRatio) = tokens[symbol]
                .collateralAuction
                .getLotInfo(index);
            require(
                tokens[symbol].collateralAuction.getLotStatus(index) ==
                    uint8(1),
                'WQRouter: Status not new'
            );
            require(
                debtPart <=
                    ((collateral -
                        tokens[symbol].collateralAuction.getComission(
                            collateral
                        )) *
                        price *
                        factor) /
                        collateralRatio,
                'WQRouter: Removed debt part is greater than all debt'
            );
            uint256 collateralPart = (debtPart * collateralRatio) /
                price /
                factor;
            collateralPart += tokens[symbol].collateralAuction.getComission(
                collateralPart
            );
            UserCollateral storage userCollateral = collaterals[symbol][
                msg.sender
            ];
            if (
                tokens[symbol].collateralAuction.decreaseLotAmount(
                    index,
                    collateralPart
                ) == 0
            ) {
                collaterals[symbol][msg.sender].lots.remove(index);
            }
            collateral -= collateralPart;

            //Transfer collateral token
            userCollateral.vault.transfer(
                payable(msg.sender),
                collateralPart,
                tokens[symbol].token
            );
            userCollateral.vault.transfer(
                payable(address(tokens[symbol].collateralAuction)),
                (tokens[symbol].collateralAuction.feeReserves() *
                    collateralPart) / 1e18,
                tokens[symbol].token
            );
            userCollateral.vault.transfer(
                feeReceiver,
                (tokens[symbol].collateralAuction.feePlatform() *
                    collateralPart) / 1e18,
                tokens[symbol].token
            );
            wusd.burn(msg.sender, debtPart);
        }
        emit Removed(
            msg.sender,
            collateral,
            (collateral * price * factor) / collateralRatio,
            price,
            collateralRatio,
            index,
            symbol
        );
    }

    function moveUserLot(
        address user,
        uint256 collateral,
        uint256 price,
        uint256 collateralRatio,
        uint256 index,
        uint256 newIndex,
        string memory symbol
    ) external onlyCollateralAuction(symbol) {
        collaterals[symbol][user].lots.remove(index);
        collaterals[symbol][user].lots.add(newIndex);
        emit Moved(
            collateral,
            (collateral *
                price *
                10 **
                    (18 -
                        IERC20MetadataUpgradeable(tokens[symbol].token)
                            .decimals())) / collateralRatio,
            price,
            index,
            newIndex,
            3,
            symbol
        );
    }

    /**
     * @dev Service function for collateral auctions
     * @dev Called when lot is selled on auction
     */
    //FIXME: add isLotExist?
    function buyCollateral(
        address buyer,
        uint256 index,
        uint256 debtAmount,
        uint256 collateralAmount,
        string memory symbol
    ) external nonReentrant onlyCollateralAuction(symbol) {
        address owner = tokens[symbol].collateralAuction.getLotOwner(index);
        {
            collaterals[symbol][owner].vault.transfer(
                payable(buyer),
                collateralAmount +
                    (tokens[symbol].collateralAuction.feeRewards() *
                        collateralAmount) /
                    1e18,
                tokens[symbol].token
            );
            collaterals[symbol][owner].vault.transfer(
                payable(address(tokens[symbol].collateralAuction)),
                (tokens[symbol].collateralAuction.feeReserves() *
                    collateralAmount) / 1e18,
                tokens[symbol].token
            );
            collaterals[symbol][owner].vault.transfer(
                feeReceiver,
                (tokens[symbol].collateralAuction.feePlatform() *
                    collateralAmount) / 1e18,
                tokens[symbol].token
            );
            wusd.burn(buyer, debtAmount);
        }

        {
            (uint256 collateral, uint256 price, uint256 ratio) = tokens[symbol]
                .collateralAuction
                .getLotInfo(index);
            emit Removed(
                owner,
                collateral,
                (collateral *
                    price *
                    10 **
                        (18 -
                            IERC20MetadataUpgradeable(tokens[symbol].token)
                                .decimals())) / ratio,
                price,
                ratio,
                index,
                symbol
            );
        }
    }

    /** View Functions */

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

    function getParams()
        external
        view
        returns (
            WQPriceOracleInterface,
            WQBridgeTokenInterface,
            address payable
        )
    {
        return (oracle, wusd, feeReceiver);
    }

    /** Admin Functions */
    /**
     * @dev Set address of price oracle contract
     * @param _oracle Address of oracle
     */
    function setContracts(
        address _oracle,
        address _wusd,
        address payable _feeReeiver
    ) external onlyRole(ADMIN_ROLE) {
        oracle = WQPriceOracleInterface(_oracle);
        wusd = WQBridgeTokenInterface(_wusd);
        feeReceiver = _feeReeiver;
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
}
