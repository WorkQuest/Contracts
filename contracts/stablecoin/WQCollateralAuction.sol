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
        uint256 created;
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
    /// @dev Upper bound coefficient of auctioned collateral
    uint256 public upperBoundCost;
    /// @dev Lower bound coefficient of auctioned collateral
    uint256 public lowerBoundCost;
    /// @dev Duration of collaterall auction
    uint256 public auctionDuration;
    /// @dev Total amount of collateral auctioned
    uint256 public totalAuctioned;
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
        uint256 _upperBoundCost,
        uint256 _lowerBoundCost,
        uint256 _auctionDuration
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
        upperBoundCost = _upperBoundCost;
        lowerBoundCost = _lowerBoundCost;
        auctionDuration = _auctionDuration;
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
                created: block.timestamp,
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
        returns (uint256)
    {
        lots[index].amount -= collaterralPart;
        uint256 remain = lots[index].amount;
        if (remain == 0) {
            _removeLot(index);
        }
        return remain;
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
    function getLiquidatedCollaterallAmount() public view returns (uint256) {
        string memory symbol = token.symbol();
        uint256 price = oracle.getTokenPriceUSD(symbol);
        uint256 factor = 10**(18 - token.decimals());
        uint256 collateral = router.getCollateral(symbol) * factor;
        uint256 debt = router.getDebt(symbol);
        if (
            collateral * price < liquidateThreshold * debt &&
            collateral * price > 1e18 * debt
        ) {
            return ((liquidateThreshold * debt) / price - collateral) / factor;
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
        totalAuctioned += amount;
        require(
            totalAuctioned <= getLiquidatedCollaterallAmount(),
            'WQAuction: Amount of tokens purchased is greater than the amount liquidated'
        );
        LotInfo storage lot = lots[index];
        require(lot.status == LotStatus.New, 'WQAuction: Status is not New');
        uint256 curRatio = (price * lot.ratio) / lot.price;
        require(
            (curRatio < liquidateThreshold && curRatio >= 1e18) ||
                (reservesEnabled && curRatio < 1e18),
            'WQAuction: This lot is not available for sale'
        );
        lot.saleAmount = amount;
        //HACK: strict compare for liquidate collateral by owner
        require(
            amount < (lot.amount * 1e18) / curRatio,
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
        uint256 curPrice = _getCurrentLotPrice(lot);
        uint256 cost = (lot.saleAmount *
            10**(18 - token.decimals()) *
            curPrice) / 1e18;
        uint256 comission = getComission(index, lot.saleAmount);
        uint256 curRatio = (curPrice * lot.ratio) / lot.price;
        totalAuctioned -= lot.saleAmount;
        lot.ratio =
            ((lot.amount - lot.saleAmount) * 1e18) /
            ((lot.amount * 1e18) / curRatio - lot.saleAmount);
        lot.amount -= lot.saleAmount;
        lot.price = curPrice;
        router.buyCollateral(
            msg.sender,
            index,
            cost,
            lot.saleAmount,
            comission,
            token.symbol()
        );
        emit LotBuyed(msg.sender, index, lot.saleAmount, cost, curPrice);
        lot.saleAmount = 0;
        lot.endPrice = 0;
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
        LotInfo storage lot = lots[index];
        require(
            lot.status == LotStatus.Auctioned,
            'WQAuction: Lot is not auctioned'
        );
        require(
            block.timestamp > lot.endTime,
            'WQAuction: Auction time is not over yet'
        );
        totalAuctioned -= lot.saleAmount;
        uint256 curPrice = oracle.getTokenPriceUSD(token.symbol());
        lot.ratio = (curPrice * lot.ratio) / lot.price;
        lot.price = curPrice;
        lot.saleAmount = 0;
        lot.endPrice = 0;
        lot.endTime = 0;
        lot.status = LotStatus.Liquidated;
        emit LotCanceled(index, lot.saleAmount, lot.endPrice);
    }

    /**
     * @dev Cancel auction when time is over
     * @param index Index value
     */
    function liquidateLot(uint256 index, uint256 amount) external {
        LotInfo storage lot = lots[index];
        require(
            lot.status == LotStatus.Liquidated,
            'WQAuction: Lot is not liquidated'
        );

        uint256 curPrice = oracle.getTokenPriceUSD(token.symbol());
        uint256 curRatio = (curPrice * lot.ratio) / lot.price;
        require(
            amount < (lot.amount * 1e18) / curRatio,
            'WQAuction: Amount of tokens purchased is greater than lot amount'
        );
        uint256 cost = (amount * 10**(18 - token.decimals()) * curPrice) / 1e18;
        uint256 comission = getComission(index, lot.saleAmount);
        lot.ratio =
            ((lot.amount - amount) * 1e18) /
            ((lot.amount * 1e18) / curRatio - amount);
        lot.amount -= amount;
        lot.price = curPrice;
        if (lot.ratio >= liquidateThreshold) lot.status = LotStatus.New;
        router.buyCollateral(
            msg.sender,
            index,
            cost,
            amount,
            comission,
            token.symbol()
        );
        emit LotBuyed(msg.sender, index, amount, cost, curPrice);
    }

    /**
     * @dev Get current comission of lot
     * @param index Index value
     */
    function getComission(uint256 index, uint256 amount)
        public
        view
        returns (uint256)
    {
        return
            (amount *
                (router.fixedRate() +
                    (router.annualInterestRate() *
                        (block.timestamp - lots[index].created)) /
                    YEAR)) / 1e18;
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
            (lot.endPrice * lowerBoundCost) /
            1e18 +
            ((lot.endTime - block.timestamp) *
                (upperBoundCost - lowerBoundCost) *
                lot.endPrice) /
            auctionDuration /
            1e18;
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
}
