// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import './WQPriceOracle.sol';
import './WQRouterInterface.sol';

contract WQSurplusAuction is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    enum LotStatus {
        Unknown,
        Auctioned,
        Selled
    }

    struct LotInfo {
        uint256 index;
        uint256 amount;
        uint256 endTime;
        address payable buyer;
        LotStatus status;
        string symbol;
    }

    /// @dev Address of price oracle
    WQPriceOracle public oracle;
    /// @dev Address of router
    WQRouterInterface public router;

    /// @dev Duration of surplus auction
    uint256 public auctionDuration;
    /// @dev Upper bound cost of auctioned surplus
    uint256 public upperBoundCost;
    /// @dev Lower bound cost of auctioned surplus
    uint256 public lowerBoundCost;
    /// @dev Maximum percentage of the lot amount to the total amount of surplus
    uint256 public maxLotAmountFactor;
    /// @dev Total amount of surplus auctioned
    uint256 public totalAuctioned;

    mapping(string => bool) public tokens;

    /// @dev Queue
    mapping(uint256 => LotInfo) public lots;
    uint256[] public amounts;

    event AuctionStarted(uint256 index, uint256 amount);

    event LotBuyed(uint256 index, uint256 amount);

    event LotCanceled(uint256 index, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _oracle,
        address _router,
        uint256 _auctionDuration,
        uint256 _upperBoundCost,
        uint256 _lowerBoundCost,
        uint256 _maxLotAmountFactor
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        oracle = WQPriceOracle(_oracle);
        router = WQRouterInterface(_router);
        auctionDuration = _auctionDuration;
        upperBoundCost = _upperBoundCost;
        lowerBoundCost = _lowerBoundCost;
        maxLotAmountFactor = _maxLotAmountFactor;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @dev Get current surplus amount (when price increased)
     */
    function getSurplusAmount(string memory symbol)
        public
        view
        returns (uint256)
    {
        uint256 collateral = router.getCollateral(symbol) *
            oracle.getTokenPriceUSD(symbol);
        uint256 debt = router.getDebt(symbol);
        if ((collateral * 2) / 3e18 > debt) {
            return (collateral * 2) / 3e18 - debt;
        }
        return 0;
    }

    /**
     *  @dev Start or restart surplus auction
     * @param amount Buyed amount of WUSD
     */
    function startAuction(uint256 amount, string calldata symbol)
        external
        nonReentrant
    {
        require(tokens[symbol], 'WQAuction: This token is disabled');
        require(amount > 0, 'WQAuction: Incorrect amount value');
        if (lots[amount].status == LotStatus.Auctioned) {
            require(
                block.timestamp > lots[amount].endTime,
                'WQAuction: Lot is auctioned yet'
            );
        } else {
            totalAuctioned += amount;
        }
        uint256 totalSurplus = getSurplusAmount(symbol);
        require(
            totalAuctioned <= totalSurplus,
            'WQAuction: Amount of bid is greater than total surplus'
        );
        require(
            (amount * 1e18) / totalSurplus <= maxLotAmountFactor,
            'WQAuction: Auction of this lot is temporarily suspended'
        );
        //If amount not exist push this
        uint256 index = lots[amount].index;
        if (
            lots[amount].index >= amounts.length ||
            amounts[lots[amount].index] != amount
        ) {
            amounts.push(amount);
            index = amounts.length - 1;
        }
        lots[amount] = LotInfo({
            index: index,
            buyer: payable(0),
            amount: amount,
            endTime: block.timestamp + auctionDuration,
            status: LotStatus.Auctioned,
            symbol: symbol
        });

        emit AuctionStarted(index, amount);
    }

    /**
     * @dev Buy auctioned surplus
     * @param index Index value
     * To need tokens approved to router
     */
    function buyLot(uint256 index, uint256 maxCost)
        external
        payable
        nonReentrant
    {
        LotInfo storage lot = lots[index];
        require(
            lot.status == LotStatus.Auctioned,
            'WQAuction: Lot is not auctioned'
        );
        require(
            block.timestamp <= lot.endTime,
            'WQAuction: Auction time is over'
        );
        uint256 totalSurplus = getSurplusAmount(lot.symbol);
        require(
            totalSurplus > 0 &&
                (lot.amount * 1e18) / totalSurplus <= maxLotAmountFactor,
            'WQAuction: Auction of this lot is temporarily suspended'
        );
        uint256 cost = _getCurrentLotCost(lot);
        if (maxCost > 0) {
            require(
                cost <= maxCost,
                'WQAuction: Current cost is greater maximum'
            );
        }
        totalAuctioned -= lot.amount;
        lot.buyer = payable(msg.sender);
        lot.status = LotStatus.Selled;
        router.transferSurplus(
            payable(msg.sender),
            lot.amount,
            cost,
            lot.symbol
        );
        emit LotBuyed(lot.index, lot.amount);
    }

    /*
     * @dev Cancel auction
     */
    /**
     * @dev Cancel lot
     * @param index Index value
     */
    function cancelLot(uint256 index) external nonReentrant {
        LotInfo storage lot = lots[index];
        require(
            lot.status == LotStatus.Auctioned,
            'WQAuction: Lot is not auctioned'
        );
        require(
            block.timestamp > lot.endTime,
            'WQAuction: Auction time is not over yet'
        );

        if (amounts[lot.index] == lot.amount) {
            totalAuctioned -= lot.amount;
            emit LotCanceled(lot.index, lot.amount);
            amounts[lot.index] = amounts[amounts.length - 1];
            lots[amounts[lot.index]].index = lot.index;
            amounts.pop();
            delete lots[index];
        }
    }

    /**
     * @dev Get current cost of auctioned debt
     * @param index Index value
     */
    function getCurrentLotCost(uint256 index) public view returns (uint256) {
        LotInfo storage lot = lots[index];
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
            ((lowerBoundCost +
                ((upperBoundCost - lowerBoundCost) *
                    (lot.endTime - block.timestamp)) /
                auctionDuration) * lot.amount) / oracle.getTokenPriceUSD('WQT');
    }

    /** Admin Functions */
    /**
     * @dev Set price oracle address
     * @param _oracle address of price oracle
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
     * @dev Set enabled tokens
     * @param symbol Symbol of token
     */
    function setToken(bool enabled, string calldata symbol)
        external
        onlyRole(ADMIN_ROLE)
    {
        tokens[symbol] = enabled;
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
     * @dev Set factor of start coefficient for dutch auction
     * @param percent Coefficient with 18 decimals, i.e. 120% is 1.2e18
     */
    function setUpperBoundCost(uint256 percent) external onlyRole(ADMIN_ROLE) {
        upperBoundCost = percent;
    }

    /**
     * @dev Set factor of start price for dutch auction
     * @param percent Coefficient with 18 decimals, i.e. 95% is 0.95e18
     */
    function setLowerBoundCost(uint256 percent) external onlyRole(ADMIN_ROLE) {
        lowerBoundCost = percent;
    }

    /**
     * @dev Set maximum percentage of the lot amount to the total amount of surplus
     * @param percent Coefficient with 18 decimals, i.e. 90% is 0.9e18
     */
    function setMaxLotAmountFactor(uint256 percent)
        external
        onlyRole(ADMIN_ROLE)
    {
        maxLotAmountFactor = percent;
    }
}
