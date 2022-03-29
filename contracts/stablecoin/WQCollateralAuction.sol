// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import './WQPriceOracle.sol';
import './WQRouterInterface.sol';

contract WQCollateralAuction is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address payable;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');
    uint256 constant YEAR = 31536000;

    enum LotStatus {
        Unknown,
        New,
        Auctioned,
        Liquidated
    }

    struct LotInfo {
        address payable user;
        uint256 price;
        uint256 amount;
        uint256 ratio;
        uint256 created;
        address payable buyer;
        uint256 saleAmount;
        uint256 endCost;
        uint256 endTime;
        LotStatus status;
    }

    /// @dev Address of price oracle
    WQPriceOracle public oracle;
    /// @dev Address of router
    WQRouterInterface public router;
    /// @dev Address of collateral token
    IERC20MetadataUpgradeable public token;

    /// @dev Threshold value when collateral liquidated
    uint256 public liquidateThreshold;
    /// @dev Upper bound coefficient of auctioned collateral
    uint256 public upperBoundCost;
    /// @dev Lower bound coefficient of auctioned collateral
    uint256 public lowerBoundCost;
    /// @dev Duration of collaterall auction
    uint256 public auctionDuration;
    /// @dev Step of price indexes
    uint256 public priceIndexStep;

    /// @dev Total amount of collateral auctioned
    uint256 public totalAuctioned;
    /// @dev Mapping priceIndex to array of lots
    mapping(uint256 => LotInfo[]) public lots;
    /// @dev Mapping priceIndex to index of array of prices
    mapping(uint256 => uint256) public priceIndexes;
    /// @dev Array of all price indexes
    uint256[] public prices;

    /**
     * @dev Event emitted when dutch auction started
     * @param priceIndex priceIndex value of lot
     * @param index index value of lot
     * @param amount Amount of tokens purchased
     * @param endCost Cost of lot (WUSD)
     */
    event AuctionStarted(
        uint256 priceIndex,
        uint256 index,
        uint256 amount,
        uint256 endCost
    );

    /**
     * @dev Event emitted when lot buyed
     * @param priceIndex priceIndex value of lot
     * @param index index value of lot
     * @param amount Amount of tokens purchased
     * @param cost Cost of lot (WUSD)
     */
    event LotBuyed(
        uint256 priceIndex,
        uint256 index,
        uint256 amount,
        uint256 cost
    );

    /**
     * @dev Event emitted when lot cancelled (after end of auction time)
     * @param priceIndex priceIndex value of lot
     * @param index index value of lot
     * @param amount Amount of tokens (0)
     * @param cost Cost of lot (0)
     */
    event LotCanceled(
        uint256 priceIndex,
        uint256 index,
        uint256 amount,
        uint256 cost
    );

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
        uint256 _upperBoundCost,
        uint256 _lowerBoundCost,
        uint256 _auctionDuration,
        uint256 _priceIndexStep
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        token = IERC20MetadataUpgradeable(_token);
        oracle = WQPriceOracle(_oracle);
        router = WQRouterInterface(_router);
        liquidateThreshold = _liquidateThreshold;
        upperBoundCost = _upperBoundCost;
        lowerBoundCost = _lowerBoundCost;
        auctionDuration = _auctionDuration;
        priceIndexStep = _priceIndexStep;
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
        address payable user,
        uint256 price,
        uint256 amount,
        uint256 ratio
    ) external onlyRouter returns (uint256, uint256) {
        uint256 priceIndex = getPriceIndex(price);
        if (lots[priceIndex].length == 0) {
            prices.push(priceIndex);
            priceIndexes[priceIndex] = prices.length - 1;
        }
        lots[priceIndex].push(
            LotInfo({
                user: user,
                price: price,
                amount: amount,
                ratio: ratio,
                created: block.timestamp,
                buyer: payable(0),
                saleAmount: 0,
                endCost: 0,
                endTime: 0,
                status: LotStatus.New
            })
        );
        return (priceIndex, lots[priceIndex].length - 1);
    }

    /**
     * @dev Service function for router
     * @dev Called when user claimed extra debt when price increased or disposed debt when price decreased
     * @param priceIndex Price index value of lot
     * @param index Index value of lot
     */
    function moveLot(
        uint256 priceIndex,
        uint256 index,
        uint256 newPrice,
        uint256 newAmount
    ) external onlyRouter returns (uint256, uint256) {
        uint256 newPriceIndex = getPriceIndex(newPrice);
        lots[priceIndex][index].price = newPrice;
        lots[priceIndex][index].amount = newAmount;
        if (priceIndex != newPriceIndex) {
            if (lots[newPriceIndex].length == 0) {
                prices.push(newPriceIndex);
                priceIndexes[newPriceIndex] = prices.length - 1;
            }
            lots[newPriceIndex].push(lots[priceIndex][index]);
            _removeLot(priceIndex, index);
            return (newPriceIndex, lots[newPriceIndex].length - 1);
        }
        return (priceIndex, index);
    }

    /**
     * @dev Service function for router. Called when user gives WUSD and takes part of collateral tokens
     * @param priceIndex Price index value of lot
     * @param index Index value of lot
     * @param collaterralPart Decreased amount of collateral part
     */
    function decreaseLotAmount(
        uint256 priceIndex,
        uint256 index,
        uint256 collaterralPart
    ) external onlyRouter returns (uint256) {
        lots[priceIndex][index].amount -= collaterralPart;
        uint256 remain = lots[priceIndex][index].amount;
        if (remain == 0) {
            _removeLot(priceIndex, index);
        }
        return remain;
    }

    function _removeLot(uint256 priceIndex, uint256 index) internal {
        uint256 lastIndex = lots[priceIndex].length - 1;
        if (lastIndex != index) {
            router.moveUserLot(
                lots[priceIndex][lastIndex].user,
                lots[priceIndex][lastIndex].amount,
                lots[priceIndex][lastIndex].price,
                priceIndex,
                lastIndex,
                priceIndex,
                index,
                token.symbol()
            );
        }
        lots[priceIndex][index] = lots[priceIndex][lastIndex];
        lots[priceIndex].pop();
        if (lots[priceIndex].length == 0) {
            _removePriceIndex(priceIndex);
        }
    }

    /**
     * @dev Get list of lots
     * @param price Price value
     * @param offset Offset value
     * @param limit Limit value
     */
    function getLots(
        uint256 price,
        uint256 offset,
        uint256 limit
    ) external view returns (LotInfo[] memory page) {
        uint256 priceIndex = getPriceIndex(price);
        if (limit > lots[priceIndex].length - offset) {
            limit = lots[priceIndex].length - offset;
        }
        page = new LotInfo[](limit);
        for (uint256 i = 0; i < limit; i++) {
            page[i] = lots[priceIndex][offset + i];
        }
        return page;
    }

    /**
     * @dev Getter of lot for router contract
     * @param priceIndex Price index value
     * @param index Index value
     */
    function getLotInfo(uint256 priceIndex, uint256 index)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        LotInfo storage lot = lots[priceIndex][index];
        return (lot.amount, lot.price, lot.ratio, lot.created, lot.saleAmount);
    }

    /**
     * @dev Getter of lot for router contract
     * @param priceIndex Price index value
     * @param index Index value
     */
    function getLotStatus(uint256 priceIndex, uint256 index)
        external
        view
        returns (uint8)
    {
        return uint8(lots[priceIndex][index].status);
    }

    /**
     * @dev Getter of lot for router contract
     * @param priceIndex Price index value
     * @param index Index value
     */
    function getLotUsers(uint256 priceIndex, uint256 index)
        external
        view
        returns (address, address)
    {
        return (lots[priceIndex][index].user, lots[priceIndex][index].buyer);
    }

    /**
     * @dev Get price index from price
     * @param price Price value
     */
    function getPriceIndex(uint256 price) public view returns (uint256) {
        return (price / priceIndexStep) * priceIndexStep;
    }

    /**
     * @dev Remove priceIndex from mapping priceIndexes and from prices array
     * @param priceIndex Index
     */
    function _removePriceIndex(uint256 priceIndex) internal {
        uint256 lastPrice = prices[prices.length - 1];
        uint256 removedIndex = priceIndexes[priceIndex];
        // Defence of remove zero element of prices array
        if (prices[removedIndex] == priceIndex) {
            prices[removedIndex] = lastPrice;
            prices.pop();
            priceIndexes[lastPrice] = removedIndex;
            delete priceIndexes[priceIndex];
        }
    }

    /**
     * @dev Get current liquidated collateral amount for given price (when price decreased)
     */
    function getLiquidatedCollaterallAmount() public view returns (uint256) {
        string memory symbol = token.symbol();
        uint256 totalCollateral = router.totalCollateral();
        if (liquidateThreshold * router.totalDebt() > totalCollateral) {
            return
                (3e18 * router.totalDebt() - 2 * totalCollateral) /
                oracle.getTokenPriceUSD(symbol);
        }
        return 0;
    }

    /**
     * @dev Start or restart collateral auction
     * @param priceIndex Price index value
     * @param index Index value
     * @param amount Amount of tokens purchased
     */
    function startAuction(
        uint256 priceIndex,
        uint256 index,
        uint256 amount
    ) external nonReentrant {
        uint256 price = oracle.getTokenPriceUSD(token.symbol());
        totalAuctioned += amount;
        require(
            totalAuctioned <= getLiquidatedCollaterallAmount(),
            'WQAuction: Amount of tokens purchased is greater than the amount liquidated'
        );
        LotInfo storage lot = lots[priceIndex][index];
        require(lot.status == LotStatus.New, 'WQAuction: Status is not New');
        uint256 collateralRatio = (price * lot.ratio) / lot.price;
        require(
            collateralRatio < liquidateThreshold && collateralRatio >= 1e18,
            'WQAuction: This lot is not available for sale'
        );
        require(
            amount <= lot.amount,
            'WQAuction: Amount of tokens purchased is greater than lot amount'
        );
        lot.saleAmount = amount;
        lot.endCost = (price * amount) / 1e18;
        lot.endTime = block.timestamp + auctionDuration;
        lot.status = LotStatus.Auctioned;
        emit AuctionStarted(priceIndex, index, amount, lot.endCost);
    }

    /**
     * @dev Buy collateral lot
     * @param priceIndex Price index value
     * @param index Index value
     */
    function buyLot(uint256 priceIndex, uint256 index)
        external
        payable
        nonReentrant
    {
        LotInfo storage lot = lots[priceIndex][index];
        require(
            lot.status == LotStatus.Auctioned,
            'WQAuction: Lot is not auctioned'
        );
        require(
            block.timestamp <= lot.endTime,
            'WQAuction: Auction time is over'
        );
        uint256 cost = _getCurrentLotCost(lot);
        uint256 fee = (cost *
            (router.fixedRate() +
                (router.annualInterestRate() *
                    (block.timestamp - lot.created)) /
                YEAR)) / 1e18;
        require(msg.value >= cost + fee, 'WQAuction: Insufficient amount');
        totalAuctioned -= lot.saleAmount;
        lot.buyer = payable(msg.sender);
        lot.amount -= lot.saleAmount;
        if (lot.amount > 0) {
            lot.status = LotStatus.New;
        } else {
            lot.status = LotStatus.Liquidated;
        }
        router.buyCollateral{value: cost + fee}(
            priceIndex,
            index,
            fee,
            token.symbol()
        );
        //Return change
        if (msg.value > cost + fee) {
            payable(msg.sender).sendValue(msg.value - cost - fee);
        }

        emit LotBuyed(priceIndex, index, lot.saleAmount, cost);
        lot.saleAmount = 0;
    }

    /**
     * @dev Get current cost of auctioned collateral
     * @param priceIndex Price index value
     * @param index Index value
     */
    function getCurrentLotCost(uint256 priceIndex, uint256 index)
        public
        view
        returns (uint256)
    {
        LotInfo storage lot = lots[priceIndex][index];
        require(
            lot.status == LotStatus.Auctioned,
            'WQAuction: This lot is not auctioned'
        );
        return _getCurrentLotCost(lot);
    }

    function _getCurrentLotCost(LotInfo storage lot)
        internal
        view
        returns (uint256)
    {
        return
            (lot.endCost * lowerBoundCost) /
            1e18 +
            ((lot.endTime - block.timestamp) *
                (upperBoundCost - lowerBoundCost) *
                lot.endCost) /
            auctionDuration /
            1e18;
    }

    /**
     * @dev Cancel auction when time is over
     * @param priceIndex Price index value
     * @param index Index value
     */
    function cancelAuction(uint256 priceIndex, uint256 index) external {
        LotInfo storage lot = lots[priceIndex][index];
        require(
            lot.status == LotStatus.Auctioned,
            'WQAuction: Lot is not auctioned'
        );
        require(
            block.timestamp > lot.endTime,
            'WQAuction: Auction time is not over yet'
        );
        totalAuctioned -= lot.saleAmount;
        lot.saleAmount = 0;
        lot.endCost = 0;
        lot.endTime = 0;
        lot.status = LotStatus.New;
        emit LotCanceled(priceIndex, index, lot.saleAmount, lot.endCost);
    }

    function getPriceIndexes(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory page)
    {
        if (limit > prices.length - offset) {
            limit = prices.length - offset;
        }
        page = new uint256[](limit);
        for (uint256 i = 0; i < limit; i++) {
            page[i] = prices[offset + i];
        }
        return page;
    }

    /** Admin Functions */

    /**
     * @dev Set price oracle address
     * @param _oracle Address of price oracle
     */
    function setOracle(address _oracle) external onlyRole(ADMIN_ROLE) {
        oracle = WQPriceOracle(_oracle);
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
     * @dev Set factor of start coefficient of cost for dutch auction
     * @param percent Coefficient with 18 decimals, i.e. 120% is 1.2e18
     */
    function setUpperBoundCost(uint256 percent) external onlyRole(ADMIN_ROLE) {
        upperBoundCost = percent;
    }

    /**
     * @dev Set factor of end coefficient of cost for dutch auction
     * @param percent Coefficient with 18 decimals, i.e. 95% is 0.95e18
     */
    function setLowerBoundCost(uint256 percent) external onlyRole(ADMIN_ROLE) {
        lowerBoundCost = percent;
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

    /**
     * @dev Set step of price indexes
     * @param step Step value in wei
     */
    function setPriceIndexStep(uint256 step) external onlyRole(ADMIN_ROLE) {
        priceIndexStep = step;
    }
}
