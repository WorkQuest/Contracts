// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import './WQPriceOracleInterface.sol';
import './WQRouterInterface.sol';

contract WQCollateralAuction is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant SERVICE_ROLE = keccak256('SERVICE_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');
    uint256 constant YEAR = 31536000;

    enum LotStatus {
        Unknown,
        New,
        Auctioned,
        Liquidated
    }

    struct LotInfo {
        address user;
        uint256 price;
        uint256 amount;
        uint256 ratio;
        uint256 saleAmount;
        uint256 endPrice;
        uint256 endTime;
        LotStatus status;
    }

    /// @dev Address of price oracle
    WQPriceOracleInterface public oracle;
    /// @dev Address of router
    WQRouterInterface public router;
    /// @dev Address of collateral token
    IERC20MetadataUpgradeable public token;

    /// @dev Threshold value when collateral liquidated
    uint256 public liquidateThreshold;
    /// @dev Duration of collaterall auction
    uint256 public auctionDuration;
    /// @dev Total amount of collateral auctioned
    uint256 public totalAuctioned;
    /// @dev Platform fee coefficient
    uint256 public feePlatform;
    /// @dev Rewards coefficient for lot buyer
    uint256 public feeRewards;
    /// @dev Fee coefficient for reserves
    uint256 public feeReserves;
    /// @dev Is reserves enabled
    bool public reservesEnabled;
    /// @dev Array of lots
    LotInfo[] public lots;

    /**
     * @dev Event emitted when dutch auction started
     * @param index index value of lot
     * @param amount Amount of tokens purchased
     * @param endCost Cost of lot (WUSD)
     */
    event AuctionStarted(uint256 index, uint256 amount, uint256 endCost);

    /**
     * @dev Event emitted when lot buyed
     * @param index index value of lot
     * @param amount Amount of tokens purchased
     * @param cost Cost of lot (WUSD)
     */
    event LotBuyed(
        address buyer,
        uint256 index,
        uint256 amount,
        uint256 cost,
        uint256 price
    );

    /**
     * @dev Event emitted when lot cancelled (after end of auction time)
     * @param index index value of lot
     * @param amount Amount of tokens (0)
     * @param cost Cost of lot (0)
     */
    event LotCanceled(uint256 index, uint256 amount, uint256 cost);

    modifier onlyRouter() {
        require(
            msg.sender == address(router),
            'WQAuction: Sender is not router'
        );
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _token,
        address _oracle,
        address _router,
        uint256 _liquidateThreshold,
        uint256 _auctionDuration,
        uint256 _feeRewards,
        uint256 _feePlatform,
        uint256 _feeReserves
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(SERVICE_ROLE, ADMIN_ROLE);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        token = IERC20MetadataUpgradeable(_token);
        oracle = WQPriceOracleInterface(_oracle);
        router = WQRouterInterface(_router);
        liquidateThreshold = _liquidateThreshold;
        auctionDuration = _auctionDuration;
        feeRewards = _feeRewards;
        feePlatform = _feePlatform;
        feeReserves = _feeReserves;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @dev Add lot to auction when user deposited collateral
     * @param price Price value
     * @param amount Amount of collateral
     * @param ratio Collateral ratio value
     */
    function addLot(
        address user,
        uint256 price,
        uint256 amount,
        uint256 ratio
    ) external onlyRouter returns (uint256) {
        lots.push(
            LotInfo({
                user: user,
                price: price,
                amount: amount,
                ratio: ratio,
                saleAmount: 0,
                endPrice: 0,
                endTime: 0,
                status: LotStatus.New
            })
        );
        return lots.length - 1;
    }

    /**
     * @dev Service function for router
     * @dev Called when user claimed extra debt when price increased or
     * @dev disposed debt when price decreased
     * @param index Index value of lot
     */
    function moveLot(
        uint256 index,
        uint256 newPrice,
        uint256 newAmount
    ) external onlyRouter returns (uint256) {
        lots[index].price = newPrice;
        lots[index].amount = newAmount;
        return index;
    }

    /**
     * @dev Service function for router.
     * @dev Called when user gives WUSD and takes part of collateral tokens
     * @param index Index value of lot
     * @param collaterralPart Decreased amount of collateral part
     */
    function decreaseLotAmount(uint256 index, uint256 collaterralPart)
        external
        onlyRouter
        returns (uint256 amount_)
    {
        lots[index].amount -= collaterralPart;
        amount_ = lots[index].amount;
        if (lots[index].amount == 0) {
            _removeLot(index);
        }
    }

    function _removeLot(uint256 index) internal {
        uint256 lastIndex = lots.length - 1;
        if (lastIndex != index) {
            router.moveUserLot(
                lots[lastIndex].user,
                lots[lastIndex].amount,
                lots[lastIndex].price,
                lots[lastIndex].ratio,
                lastIndex,
                index,
                token.symbol()
            );
        }
        lots[index] = lots[lastIndex];
        lots.pop();
    }

    /**
     * @dev Get list of lots
     * @param offset Offset value
     * @param limit Limit value
     */
    function getLots(uint256 offset, uint256 limit)
        external
        view
        returns (LotInfo[] memory page)
    {
        if (limit > lots.length - offset) {
            limit = lots.length - offset;
        }
        page = new LotInfo[](limit);
        for (uint256 i = 0; i < limit; i++) {
            page[i] = lots[offset + i];
        }
        return page;
    }

    /**
     * @dev Getter of lot for router contract
     * @param index Index value
     */
    function getLotInfo(uint256 index)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        LotInfo storage lot = lots[index];
        return (lot.amount, lot.price, lot.ratio);
    }

    /**
     * @dev Getter of lot for router contract
     * @param index Index value
     */
    function getLotStatus(uint256 index) external view returns (uint8) {
        return uint8(lots[index].status);
    }

    /**
     * @dev Getter of lot for router contract
     * @param index Index value
     */
    function getLotOwner(uint256 index) external view returns (address) {
        return lots[index].user;
    }

    /**
     * @dev Get current liquidated collateral amount for given price (when price decreased)
     */
    function getLiquidatedCollaterallAmount(uint256 index)
        public
        view
        returns (uint256)
    {
        string memory symbol = token.symbol();
        uint256 price = oracle.getTokenPriceUSD(symbol);
        uint256 factor = 10**(18 - token.decimals());
        uint256 collateral = lots[index].amount * factor;
        uint256 debt = (lots[index].amount * factor * lots[index].price) /
            lots[index].ratio;
        if (
            collateral * price < liquidateThreshold * debt &&
            collateral * price > 1e18 * debt
        ) {
            return
                (collateral * (lots[index].price - price) * 1e18) /
                lots[index].ratio /
                price /
                factor;
        }
        return 0;
    }

    /**
     * @dev Start or restart collateral auction
     * @param index Index value
     * @param amount Amount of tokens purchased
     */
    function startAuction(uint256 index, uint256 amount) external nonReentrant {
        uint256 price = oracle.getTokenPriceUSD(token.symbol());
        LotInfo storage lot = lots[index];
        require(lot.status == LotStatus.New, 'WQAuction: Status is not New');
        uint256 curRatio = (price * lot.ratio) / lot.price;
        require(
            (curRatio < liquidateThreshold && curRatio >= 1e18) ||
                (reservesEnabled && curRatio < 1e18),
            'WQAuction: This lot is not available for sale'
        );
        lot.saleAmount = amount;
        require(
            amount <= getLiquidatedCollaterallAmount(index),
            'WQAuction: Amount of tokens purchased is greater than lot amount'
        );
        if (reservesEnabled) {
            require(
                amount <= lot.amount + token.balanceOf(address(this)),
                'WQAuction: Amount of tokens purchased is greater than lot amount and reserves'
            );
        }
        lot.endPrice = price;
        lot.endTime = block.timestamp + auctionDuration;
        lot.status = LotStatus.Auctioned;
        emit AuctionStarted(index, amount, lot.endPrice);
    }

    /**
     * @dev Buy collateral lot
     * @param index Index value
     */
    function buyLot(uint256 index) external nonReentrant {
        LotInfo storage lot = lots[index];
        require(
            lot.status == LotStatus.Auctioned,
            'WQAuction: Lot is not auctioned'
        );
        require(
            block.timestamp <= lot.endTime,
            'WQAuction: Auction time is over'
        );
        uint256 factor = 10**(18 - token.decimals());
        uint256 cost = (lot.saleAmount * factor * _getCurrentLotPrice(lot)) /
            1e18;
        if ((lot.endPrice * lot.ratio) / lot.price >= 1e18) {
            lot.ratio =
                ((lot.amount - lot.saleAmount - getComission(lot.saleAmount)) *
                    factor *
                    lot.price) /
                ((lot.amount * lot.price * factor) / lot.ratio - cost);
            lot.amount -= lot.saleAmount + getComission(lot.saleAmount);
            router.buyCollateral(
                msg.sender,
                index,
                cost,
                lot.saleAmount,
                token.symbol()
            );
        } else {
            require(reservesEnabled, 'WQAuction: Reserves is not enabled');
            //FIXME: calculate reserves
            // router.buyCollateral(
            //     msg.sender,
            //     index,
            //     cost,
            //     lot.amount,
            //     token.symbol()
            // );
            // //Transfer reserves
            // IERC20Upgradeable(address(token)).safeTransfer(
            //     msg.sender,
            //     lot.saleAmount - lot.amount
            // );
            // _removeLot(index);
        }
        emit LotBuyed(
            msg.sender,
            index,
            lot.saleAmount + (lot.saleAmount * feeRewards) / 1e18,
            cost,
            lot.endPrice
        );
        lot.endPrice = 0;
        lot.saleAmount = 0;
        lot.endTime = 0;
        lot.status = LotStatus.New;
    }

    function enableReserves() external nonReentrant onlyRole(SERVICE_ROLE) {
        reservesEnabled = true;
    }

    function disableReserves() external nonReentrant onlyRole(SERVICE_ROLE) {
        reservesEnabled = false;
    }

    /**
     * @dev Cancel auction when time is over
     * @param index Index value
     */
    function cancelAuction(uint256 index) external {
        // for (uint256 i = 0; i < indexes.length; i++) {
        // LotInfo storage lot = lots[indexes[i]];
        LotInfo storage lot = lots[index];
        require(
            lot.status == LotStatus.Auctioned,
            'WQAuction: Lot is not auctioned'
        );
        require(
            block.timestamp > lot.endTime,
            'WQAuction: Auction time is not over yet'
        );
        lot.saleAmount = 0;
        lot.endPrice = 0;
        lot.endTime = 0;
        lot.status = LotStatus.New;
        emit LotCanceled(index, lot.saleAmount, lot.endPrice);
        // }
    }

    /**
     * @dev Restart auction when time is over
     * @param index Indexes value
     */
    function restartAuction(uint256 index) external {
        uint256 price = oracle.getTokenPriceUSD(token.symbol());
        // for (uint256 i = 0; i < indexes.length; i++) {
        LotInfo storage lot = lots[index];
        require(
            lot.status == LotStatus.Auctioned,
            'WQAuction: Lot is not auctioned'
        );
        require(
            block.timestamp > lot.endTime,
            'WQAuction: Auction time is not over yet'
        );
        lot.endPrice = price;
        lot.endTime = block.timestamp + auctionDuration;
        emit LotCanceled(index, lot.saleAmount, lot.endPrice);
        // }
    }

    /**
     * @dev Get current comission of lot
     * @param amount Collateral amount value
     */
    function getComission(uint256 amount) public view returns (uint256) {
        return (amount * (feeRewards + feePlatform + feeReserves)) / 1e18;
    }

    /**
     * @dev Get current cost of auctioned collateral
     * @param index Index value
     */
    function getCurrentLotCost(uint256 index) public view returns (uint256) {
        LotInfo storage lot = lots[index];
        require(
            lot.status == LotStatus.Auctioned,
            'WQAuction: This lot is not auctioned'
        );
        return
            (lot.saleAmount *
                10**(18 - token.decimals()) *
                _getCurrentLotPrice(lot)) / 1e18;
    }

    function _getCurrentLotPrice(LotInfo storage lot)
        internal
        view
        returns (uint256)
    {
        return
            lot.endPrice +
            ((lot.endTime - block.timestamp) * (lot.price - lot.endPrice)) /
            auctionDuration;
    }

    /** Admin Functions */

    /**
     * @dev Set price oracle address
     * @param _oracle Address of price oracle
     */
    function setOracle(address _oracle) external onlyRole(ADMIN_ROLE) {
        oracle = WQPriceOracleInterface(_oracle);
    }

    /**
     * @dev Set router address
     * @param _router Address of router
     */
    function setRouter(address _router) external onlyRole(ADMIN_ROLE) {
        router = WQRouterInterface(_router);
    }

    /**
     * @dev Set collateral token address
     * @param _token Address of token
     */
    function setToken(address _token) external onlyRole(ADMIN_ROLE) {
        token = IERC20MetadataUpgradeable(_token);
    }

    /**
     * @dev Set threshold value when collateral liquidated
     * @param percent Threshold value with 18 decimals, i.e. 140% is 1.4e18
     */
    function setLiquidateTreshold(uint256 percent)
        external
        onlyRole(ADMIN_ROLE)
    {
        liquidateThreshold = percent;
    }

    /**
     * @dev Set duration of dutch auction
     * @param duration Duration value in seconds
     */
    function setAuctionDuration(uint256 duration)
        external
        onlyRole(ADMIN_ROLE)
    {
        auctionDuration = duration;
    }

    function setRate(
        uint256 _feeRewards,
        uint256 _feePlatform,
        uint256 _feeReserves
    ) external onlyRole(ADMIN_ROLE) {
        feeRewards = _feeRewards;
        feePlatform = _feePlatform;
        feeReserves = _feeReserves;
    }
}
