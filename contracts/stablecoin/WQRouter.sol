// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "./WQPriceOracle.sol";
import "./WQRouterVault.sol";
import "./WQCollateralAuction.sol";
import "./WQSurplusAuction.sol";
import "./WQDebtAuction.sol";

contract WQRouter is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address payable;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    uint256 constant YEAR = 31536000;

    struct UserLot {
        uint256 priceIndex;
        uint256 index;
    }

    struct UserCollateral {
        uint256 collateralAmount;
        uint256 debtAmount;
        WQRouterVault vault;
        mapping(bytes32 => uint256) lotHashIndexes;
        UserLot[] lots;
    }

    /**
     * @dev Settings of collateral token
     */
    struct TokenSettings {
        uint256 index;
        uint256 totalCollateral;
        address token;
        WQCollateralAuction collateralAuction;
        bool enabled;
    }

    WQPriceOracle public oracle;
    IERC20Upgradeable wqt;
    WQSurplusAuction public surplusAuction;
    WQDebtAuction public debtAuction;

    /**
     * @notice Stability fee settings
     */
    uint256 public fixedRate;
    uint256 public annualInterestRate;

    uint256 public totalDebt;
    uint256 public surplus;

    mapping(string => TokenSettings) public tokens;
    mapping(string => mapping(address => UserCollateral)) public collaterals;
    string[] public tokenList;

    /**
     * @dev Event emitted when user deposited colateral tokens and takes WUSD
     * @param user Address of user
     * @param collateral Collateral amount of tokens (ETH, BNB, etc.)
     * @param debt Given amount of WUSD
     * @param price Current price of collateral token
     * @param priceIndex priceIndex value of lot on auction
     * @param index index value of lot on auction
     * @param symbol Symbol of collateral token
     */
    event Produced(
        address user,
        uint256 collateral,
        uint256 debt,
        uint256 price,
        uint256 priceIndex,
        uint256 index,
        string symbol
    );

    /**
     * @dev Event emitted when user claimed extra debt, disposed debt, added collateral or called service function moveUserLot
     * @param collateral Collateral amount of tokens (ETH, BNB, etc.)
     * @param price Current price of collateral token
     * @param oldPriceIndex old priceIndex value of lot on auction
     * @param oldIndex old priceIndex value of lot on auction
     * @param newPriceIndex new priceIndex value of lot on auction
     * @param newIndex new priceIndex value of lot on auction
     * @param symbol Symbol of collateral token
     */
    event Moved(
        uint256 collateral,
        uint256 price,
        uint256 oldPriceIndex,
        uint256 oldIndex,
        uint256 newPriceIndex,
        uint256 newIndex,
        string symbol
    );

    /**
     * @dev Event emitted when user liquidated part of collateral or lot is partially selled
     * @param user Address of user
     * @param collateral Amount of given tokens (ETH, BNB, etc.)
     * @param debt Amount of payed WUSD
     * @param priceIndex priceIndex value of lot on auction
     * @param index index value of lot on auction
     * @param symbol Symbol of collateral token
     */
    event Removed(
        address user,
        uint256 collateral,
        uint256 debt,
        uint256 priceIndex,
        uint256 index,
        string symbol
    );

    /**
     * @dev Service event, emitted when contract received WUSD
     */
    event Received(uint256 amount);

    modifier onlyEnabledToken(string calldata symbol) {
        require(tokens[symbol].enabled, "WQRouter: Token diabled");
        _;
    }

    modifier onlyCollateralAuction(string calldata symbol) {
        require(
            msg.sender == address(tokens[symbol].collateralAuction),
            "WQRouter: Only collateral auction"
        );
        _;
    }

    modifier onlySurplusAuction() {
        require(
            msg.sender == address(surplusAuction),
            "WQRouter: Only surplus auction"
        );
        _;
    }

    modifier onlyDebtAuction() {
        require(
            msg.sender == address(debtAuction),
            "WQRouter: Only debt auction"
        );
        _;
    }

    function isLotExist(
        uint256 priceIndex,
        uint256 index,
        string calldata symbol
    ) internal view {
        UserCollateral storage userCollateral = collaterals[symbol][msg.sender];
        uint256 lotIndex = userCollateral.lotHashIndexes[
            keccak256(abi.encodePacked(priceIndex, index))
        ];
        require(
            userCollateral.lots[lotIndex].priceIndex == priceIndex &&
                userCollateral.lots[lotIndex].index == index,
            "WQRouter: Lot not found"
        );
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _oracle,
        address _wqt,
        uint256 _fixedRate,
        uint256 _annualInterestRate
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        oracle = WQPriceOracle(_oracle);
        wqt = IERC20Upgradeable(_wqt);
        fixedRate = _fixedRate;
        annualInterestRate = _annualInterestRate;
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
            collateralRatio >= 1.5e18,
            "WQRouter: Invalid collateral ratio"
        );
        UserCollateral storage userCollateral = collaterals[symbol][msg.sender];
        if (userCollateral.vault == WQRouterVault(address(0))) {
            userCollateral.vault = new WQRouterVault(msg.sender);
        }
        userCollateral.collateralAmount += collateralAmount;
        tokens[symbol].totalCollateral += collateralAmount;
        uint256 price = oracle.getTokenPriceUSD(symbol);
        uint256 debtAmount = (collateralAmount * price) / collateralRatio;
        userCollateral.debtAmount += debtAmount;
        totalDebt += debtAmount;

        //Add lot to collateralAuction
        (uint256 priceIndex, uint256 index) = tokens[symbol]
            .collateralAuction
            .addLot(
                payable(msg.sender),
                price,
                collateralAmount,
                collateralRatio
            );
        // Save indexes of lot
        _addUserLot(msg.sender, priceIndex, index, symbol);

        // Save info in vault
        userCollateral.vault.addAmount(collateralAmount);
        // Take tokens
        IERC20Upgradeable(tokens[symbol].token).safeTransferFrom(
            msg.sender,
            address(userCollateral.vault),
            collateralAmount
        );
        // Send native coins
        payable(msg.sender).sendValue(debtAmount);
        emit Produced(
            msg.sender,
            collateralAmount,
            debtAmount,
            price,
            priceIndex,
            index,
            symbol
        );
    }

    /**
     * @dev User claimed extra debt when price of collateral is increased
     * @dev The price of the lot at the collateralAuction also increases to increase the risk of liquidation
     * @param priceIndex priceIndex of lot
     * @param index index of lot
     * @param symbol Symbol of token
     */
    function claimExtraDebt(
        uint256 priceIndex,
        uint256 index,
        string calldata symbol
    ) external nonReentrant onlyEnabledToken(symbol) {
        isLotExist(priceIndex, index, symbol);
        UserCollateral storage userCollateral = collaterals[symbol][msg.sender];
        uint256 price = oracle.getTokenPriceUSD(symbol);
        uint256 newPriceIndex;
        uint256 newIndex;
        uint256 lotAmount;
        {
            uint256 lotPrice;
            uint256 collateralRatio;
            (lotAmount, lotPrice, collateralRatio, , ) = tokens[symbol]
                .collateralAuction
                .getLotInfo(priceIndex, index);
            require(
                tokens[symbol].collateralAuction.getLotStatus(
                    priceIndex,
                    index
                ) == uint8(1),
                "WQRouter: Status not new"
            );
            uint256 extraDebt = ((price - lotPrice) * lotAmount) /
                collateralRatio;

            totalDebt += extraDebt;
            userCollateral.debtAmount += extraDebt;
            payable(msg.sender).sendValue(extraDebt);
            (newPriceIndex, newIndex) = tokens[symbol]
                .collateralAuction
                .moveLot(priceIndex, index, price, lotAmount);
            _removeUserLot(msg.sender, priceIndex, index, symbol);
            _addUserLot(msg.sender, newPriceIndex, newIndex, symbol);
        }
        emit Moved(
            lotAmount,
            price,
            priceIndex,
            index,
            newPriceIndex,
            newIndex,
            symbol
        );
    }

    /**
     * @dev User disposed debt when price of collateral is decreased
     * @dev The price of the lot at the collateralAuction also decreases to decrease the risk of liquidation
     * @param priceIndex priceIndex of lot
     * @param index index of lot
     * @param symbol Symbol of token
     */
    function disposeDebt(
        uint256 priceIndex,
        uint256 index,
        string calldata symbol
    ) external payable nonReentrant onlyEnabledToken(symbol) {
        isLotExist(priceIndex, index, symbol);
        uint256 newPriceIndex;
        uint256 newIndex;
        uint256 price = oracle.getTokenPriceUSD(symbol);
        uint256 lotAmount;
        {
            UserCollateral storage userCollateral = collaterals[symbol][
                msg.sender
            ];
            uint256 lotPrice;
            uint256 collateralRatio;
            (lotAmount, lotPrice, collateralRatio, , ) = tokens[symbol]
                .collateralAuction
                .getLotInfo(priceIndex, index);
            require(
                tokens[symbol].collateralAuction.getLotStatus(
                    priceIndex,
                    index
                ) == uint8(1),
                "WQRouter: Status not new"
            );
            uint256 returnDebt = ((lotPrice - price) * lotAmount) /
                collateralRatio;
            require(msg.value >= returnDebt, "WQRouter: Insufficient value");
            // Return change
            if (msg.value > returnDebt) {
                payable(msg.sender).sendValue(msg.value - returnDebt);
            }
            totalDebt -= returnDebt;
            userCollateral.debtAmount -= returnDebt;
            (newPriceIndex, newIndex) = tokens[symbol]
                .collateralAuction
                .moveLot(priceIndex, index, price, lotAmount);
            _removeUserLot(msg.sender, priceIndex, index, symbol);
            _addUserLot(msg.sender, newPriceIndex, newIndex, symbol);
        }
        emit Moved(
            lotAmount,
            price,
            priceIndex,
            index,
            newPriceIndex,
            newIndex,
            symbol
        );
    }

    /**
     * @dev User add collateral when price of collateral is decreased
     * @dev The price of the lot at the collateralAuction also decreases to decrease the risk of liquidation
     * @param priceIndex priceIndex of lot
     * @param index index of lot
     * @param symbol Symbol of token
     */
    function addCollateral(
        uint256 priceIndex,
        uint256 index,
        string calldata symbol
    ) external nonReentrant onlyEnabledToken(symbol) {
        isLotExist(priceIndex, index, symbol);
        uint256 newPriceIndex;
        uint256 newIndex;
        uint256 price = oracle.getTokenPriceUSD(symbol);
        uint256 lotAmount;
        uint256 addedCollateral;
        {
            uint256 lotPrice;
            (lotAmount, lotPrice, , , ) = tokens[symbol]
                .collateralAuction
                .getLotInfo(priceIndex, index);
            require(
                tokens[symbol].collateralAuction.getLotStatus(
                    priceIndex,
                    index
                ) == uint8(1),
                "WQRouter: Status not new"
            );
            addedCollateral = (lotPrice * lotAmount) / price - lotAmount;
            tokens[symbol].totalCollateral += addedCollateral;
            collaterals[symbol][msg.sender].collateralAmount += addedCollateral;
            collaterals[symbol][msg.sender].vault.addAmount(addedCollateral);
            (newPriceIndex, newIndex) = tokens[symbol]
                .collateralAuction
                .moveLot(priceIndex, index, price, lotAmount + addedCollateral);
            _removeUserLot(msg.sender, priceIndex, index, symbol);
            _addUserLot(msg.sender, newPriceIndex, newIndex, symbol);
            IERC20Upgradeable(tokens[symbol].token).safeTransferFrom(
                msg.sender,
                address(collaterals[symbol][msg.sender].vault),
                addedCollateral
            );
        }
        emit Moved(
            lotAmount + addedCollateral,
            price,
            priceIndex,
            index,
            newPriceIndex,
            newIndex,
            symbol
        );
    }

    /**
     * @dev Partial liquidate of a collateral.
     * @dev User gives WUSD (debeted WUSD + comission) and takes part of collateral tokens
     * @param priceIndex priceIndex of lot
     * @param index index of lot
     * @param debtPart Amount of liquidated part of debt
     * @param symbol Symbol of token
     */
    function removeCollateral(
        uint256 priceIndex,
        uint256 index,
        uint256 debtPart,
        string calldata symbol
    ) external payable nonReentrant onlyEnabledToken(symbol) {
        isLotExist(priceIndex, index, symbol);
        uint256 collateralPart;
        {
            (
                ,
                uint256 price,
                uint256 collateralRatio,
                uint256 createdAt,

            ) = tokens[symbol].collateralAuction.getLotInfo(priceIndex, index);
            require(
                tokens[symbol].collateralAuction.getLotStatus(
                    priceIndex,
                    index
                ) == uint8(1),
                "WQRouter: Status not new"
            );
            uint256 fee = (debtPart *
                (fixedRate +
                    (annualInterestRate * (block.timestamp - createdAt)) /
                    YEAR)) / 1e18;
            require(
                msg.value >= debtPart + fee,
                "WQRouter: Insufficient value"
            );
            collateralPart = (debtPart * collateralRatio) / price;
            totalDebt -= debtPart;
            surplus += fee;
            tokens[symbol].totalCollateral -= collateralPart;
            UserCollateral storage userCollateral = collaterals[symbol][
                msg.sender
            ];

            userCollateral.debtAmount -= debtPart;
            userCollateral.collateralAmount -= collateralPart;
            uint256 remain = tokens[symbol].collateralAuction.decreaseLotAmount(
                priceIndex,
                index,
                collateralPart
            );
            if (remain == 0) {
                _removeUserLot(msg.sender, priceIndex, index, symbol);
            }

            //Return change
            if (msg.value > debtPart + fee) {
                payable(msg.sender).sendValue(msg.value - debtPart - fee);
            }
            //Transfer collateral token
            userCollateral.vault.transfer(
                payable(msg.sender),
                collateralPart,
                tokens[symbol].token
            );
        }
        emit Removed(
            msg.sender,
            collateralPart,
            debtPart,
            priceIndex,
            index,
            symbol
        );
    }

    function _addUserLot(
        address user,
        uint256 priceIndex,
        uint256 index,
        string calldata symbol
    ) internal {
        UserCollateral storage userCollateral = collaterals[symbol][user];
        userCollateral.lots.push(
            UserLot({priceIndex: priceIndex, index: index})
        );
        userCollateral.lotHashIndexes[
            keccak256(abi.encodePacked(priceIndex, index))
        ] = userCollateral.lots.length - 1;
    }

    function _removeUserLot(
        address user,
        uint256 priceIndex,
        uint256 index,
        string calldata symbol
    ) internal {
        UserCollateral storage userCollateral = collaterals[symbol][user];
        bytes32 hashIndex = keccak256(abi.encodePacked(priceIndex, index));
        uint256 lotIndex = userCollateral.lotHashIndexes[hashIndex];
        uint256 lastLotIndex = userCollateral.lots.length - 1;
        bytes32 lastHashIndex = keccak256(
            abi.encodePacked(
                userCollateral.lots[lastLotIndex].priceIndex,
                userCollateral.lots[lastLotIndex].index
            )
        );
        // Defence of remove zero element of lots
        if (
            userCollateral.lots[lotIndex].priceIndex == priceIndex &&
            userCollateral.lots[lotIndex].index == index
        ) {
            userCollateral.lots[lotIndex] = userCollateral.lots[lastLotIndex];
            userCollateral.lots.pop();
            userCollateral.lotHashIndexes[lastHashIndex] = lotIndex;
            delete userCollateral.lotHashIndexes[hashIndex];
        }
    }

    function moveUserLot(
        address user,
        uint256 collateral,
        uint256 price,
        uint256 priceIndex,
        uint256 index,
        uint256 newPriceIndex,
        uint256 newIndex,
        string calldata symbol
    ) external onlyCollateralAuction(symbol) {
        _removeUserLot(user, priceIndex, index, symbol);
        _addUserLot(user, newPriceIndex, newIndex, symbol);
        emit Moved(
            collateral,
            price,
            priceIndex,
            index,
            newPriceIndex,
            newIndex,
            symbol
        );
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
    ) external view returns (UserLot[] memory page) {
        UserLot[] storage lots = collaterals[symbol][user].lots;
        if (limit > lots.length - offset) {
            limit = lots.length - offset;
        }
        page = new UserLot[](limit);
        for (uint256 i = 0; i < limit; i++) {
            page[i] = lots[offset + i];
        }
        return page;
    }

    /**
     * @dev Service function for collateral auctions
     * @dev Called when lot is selled on auction
     */
    //FIXME: add isLotExist?
    function buyCollateral(
        uint256 priceIndex,
        uint256 index,
        uint256 fee,
        string calldata symbol
    ) external payable nonReentrant onlyCollateralAuction(symbol) {
        uint256 collateralPart;
        uint256 lotPrice;
        uint256 collateralRatio;
        {
            (, lotPrice, collateralRatio, , collateralPart) = tokens[symbol]
                .collateralAuction
                .getLotInfo(priceIndex, index);
            (address owner, address buyer) = tokens[symbol]
                .collateralAuction
                .getLotUsers(priceIndex, index);
            UserCollateral storage userCollateral = collaterals[symbol][owner];
            userCollateral.collateralAmount -= collateralPart;
            tokens[symbol].totalCollateral -= collateralPart;
            userCollateral.debtAmount -=
                (collateralPart * lotPrice) /
                collateralRatio;
            totalDebt -= msg.value - fee;
            surplus += fee;
            if (
                tokens[symbol].collateralAuction.getLotStatus(
                    priceIndex,
                    index
                ) == uint8(4)
            ) {
                _removeUserLot(owner, priceIndex, index, symbol);
            }
            userCollateral.vault.transfer(
                payable(buyer),
                collateralPart,
                tokens[symbol].token
            );
        }
        emit Removed(
            msg.sender,
            collateralPart,
            (collateralPart * lotPrice) / collateralRatio,
            priceIndex,
            index,
            symbol
        );
    }

    function totalCollateral() external view returns (uint256 amount) {
        for (uint256 i = 0; i < tokenList.length; i++) {
            amount +=
                tokens[tokenList[i]].totalCollateral *
                oracle.getTokenPriceUSD(tokenList[i]);
        }
        return amount;
    }

    /**
     * @dev Transfer WQT from user and send him WUSD
     */
    function transferSurplus(
        address payable user,
        uint256 amount,
        uint256 cost
    ) external onlySurplusAuction {
        totalDebt += amount;
        //FIXME: transfer wqt to vault
        wqt.transferFrom(user, address(this), cost);
        user.sendValue(amount);
    }

    /**
     * @dev Transfer WUSD from user and send him WQT
     */
    function transferDebt(address user, uint256 amount)
        external
        payable
        onlyDebtAuction
    {
        totalDebt -= msg.value;
        //FIXME: transfer wqt from vault to user
        wqt.transfer(user, amount);
    }

    /** Admin Functions */

    /**
     * @dev Set address of collateral auction contract
     * @param auction Address of surplus auction
     */
    function setSurplusAuction(address auction) external onlyRole(ADMIN_ROLE) {
        surplusAuction = WQSurplusAuction(auction);
    }

    /**
     * @dev Set address of collateral auction contract
     * @param auction Address of debt auction
     */
    function setDebtAuction(address auction) external onlyRole(ADMIN_ROLE) {
        debtAuction = WQDebtAuction(auction);
    }

    /**
     * @dev Set address of price oracle contract
     * @param _oracle Address of oracle
     */
    function setOracle(address _oracle) external onlyRole(ADMIN_ROLE) {
        oracle = WQPriceOracle(_oracle);
    }

    /**
     * @dev Set address of token
     * @param token Address of token
     * @param auction Address of collateral auction
     * @param symbol Symbol of token
     */
    function addToken(
        address token,
        address auction,
        string calldata symbol
    ) external onlyRole(ADMIN_ROLE) {
        tokens[symbol].enabled = true;
        tokens[symbol].token = token;
        tokens[symbol].collateralAuction = WQCollateralAuction(auction);
        tokens[symbol].index = tokenList.length;
        tokenList.push(symbol);
    }

    /**
     * @dev Update settings of token
     * @param symbol Symbol of token
     * @param auction Address of collateral auction
     * @param enabled Token disabled/enabled flag
     */
    function updateToken(
        bool enabled,
        address token,
        address auction,
        string calldata symbol
    ) external onlyRole(ADMIN_ROLE) {
        tokens[symbol].token = token;
        tokens[symbol].collateralAuction = WQCollateralAuction(auction);
        tokens[symbol].enabled = enabled;
    }

    /**
     * @dev Set fixed rate value value
     * @param _fixedRate Fixed rate value
     */
    function updateFixedRate(uint256 _fixedRate) external onlyRole(ADMIN_ROLE) {
        fixedRate = _fixedRate;
    }

    /**
     * @dev Set stability fee value
     * @param _annualInterestRate Annual interest rate value
     */
    function updateAnnualInterestRate(uint256 _annualInterestRate)
        external
        onlyRole(ADMIN_ROLE)
    {
        annualInterestRate = _annualInterestRate;
    }

    function cleanVault(address user) external onlyRole(ADMIN_ROLE) {
        for (uint256 i = 0; i < tokenList.length; i++) {
            UserCollateral storage uc = collaterals[tokenList[i]][user];
            uc.collateralAmount = 0;
            uc.debtAmount = 0;
            for (uint256 j = 0; j < uc.lots.length; j++) {
                uc.lots.pop();
            }
            tokens[tokenList[i]].totalCollateral = 0;
        }
        totalDebt = 0;
    }
}