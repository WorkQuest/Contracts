// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "./WQPriceOracle.sol";
import "./WQRouterInterface.sol";

contract WQDebtAuction is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using AddressUpgradeable for address payable;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

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
    }

    /// @dev Address of price oracle
    WQPriceOracle public oracle;
    /// @dev Address of router
    WQRouterInterface public router;
    /// @dev Address of token WQT
    IERC20MetadataUpgradeable public token;

    /// @dev Duration of debt auction
    uint256 public auctionDuration;
    /// @dev Upper bound coefficient of auctioned debt
    uint256 public upperBoundCost;
    /// @dev Lower bound coefficient of auctioned debt
    uint256 public lowerBoundCost;
    /// @dev Maximum percentage of the lot amount to the total amount of debt
    uint256 public maxLotAmountFactor;

    /// @dev Total amount of debt auctioned
    uint256 public totalAuctioned;
    /// @dev Queue
    mapping(uint256 => LotInfo) public lots;
    uint256[] public amounts;

    event AuctionStarted(uint256 index, uint256 amount);

    event LotBuyed(uint256 index, uint256 amount);

    event LotCanceled(uint256 index, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _token,
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
        token = IERC20MetadataUpgradeable(_token);
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
     * @dev Get current debt amount (when price increased)
     */
    function getDebtAmount() public view returns (uint256) {
        if (router.totalDebt() > (router.totalCollateral() * 2) / 3e18) {
            return router.totalDebt() - (router.totalCollateral() * 2) / 3e18;
        }
        return 0;
    }

    /**
     *  @dev Start or restart debt auction
     * @param amount Selled amount of WUSD
     */
    function startAuction(uint256 amount) external nonReentrant {
        require(amount > 0, "WQAuction: Incorrect amount value");
        if (lots[amount].status == LotStatus.Auctioned) {
            require(
                block.timestamp > lots[amount].endTime,
                "WQAuction: Lot is auctioned yet"
            );
        } else {
            totalAuctioned += amount;
        }
        uint256 totalDebt = getDebtAmount();
        require(
            totalAuctioned <= totalDebt,
            "WQAuction: Amount of bid is greater than total debt"
        );
        require(
            (amount * 1e18) / totalDebt <= maxLotAmountFactor,
            "WQAuction: Auction of this lot is temporarily suspended"
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
            amount: amount,
            endTime: block.timestamp + auctionDuration,
            buyer: payable(0),
            status: LotStatus.Auctioned
        });

        emit AuctionStarted(index, amount);
    }

    /**
     * @dev Buy auctioned debt
     * @param index Index value
     */
    function buyLot(uint256 index, uint256 minCost)
        external
        payable
        nonReentrant
    {
        LotInfo storage lot = lots[index];
        require(
            lot.status == LotStatus.Auctioned,
            "WQAuction: Lot is not auctioned"
        );
        require(
            block.timestamp <= lot.endTime,
            "WQAuction: Auction time is over"
        );
        uint256 totalDebt = getDebtAmount();
        require(
            totalDebt > 0 &&
                (lot.amount * 1e18) / totalDebt <= maxLotAmountFactor,
            "WQAuction: Auction of this lot is temporarily suspended"
        );
        require(msg.value >= lot.amount, "WQAuction: Insufficient amount");
        uint256 cost = _getCurrentLotCost(lot);
        if (minCost > 0) {
            require(
                cost >= minCost,
                "WQAuction: Current cost is least minimum"
            );
        }
        totalAuctioned -= lot.amount;
        lot.buyer = payable(msg.sender);
        lot.status = LotStatus.Selled;
        router.transferDebt{value: lot.amount}(msg.sender, cost);
        //Return change
        if (msg.value > lot.amount) {
            payable(msg.sender).sendValue(msg.value - lot.amount);
        }
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
            "WQAuction: Lot is not auctioned"
        );
        require(
            block.timestamp > lot.endTime,
            "WQAuction: Auction time is not over yet"
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
            "WQAuction: This lot is not auctioned"
        );
        return _getCurrentLotCost(lot);
    }

    function _getCurrentLotCost(LotInfo storage lot)
        internal
        view
        returns (uint256)
    {
        return
            ((upperBoundCost -
                ((upperBoundCost - lowerBoundCost) *
                    (lot.endTime - block.timestamp)) /
                auctionDuration) * lot.amount) /
            oracle.getTokenPriceUSD(token.symbol());
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
     * @dev Set WQT token address
     * @param _token Address of token
     */
    function setToken(address _token) external onlyRole(ADMIN_ROLE) {
        token = IERC20MetadataUpgradeable(_token);
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
     * @param percent Coefficient with 18 decimals, i.e. 105% is 1.05e18
     */
    function setUpperBoundCost(uint256 percent) external onlyRole(ADMIN_ROLE) {
        upperBoundCost = percent;
    }

    /**
     * @dev Set factor of start price for dutch auction
     * @param percent Coefficient with 18 decimals, i.e. 80% is 0.8e18
     */
    function setLowerBoundCost(uint256 percent) external onlyRole(ADMIN_ROLE) {
        lowerBoundCost = percent;
    }

    /**
     * @dev Set maximum percentage of the lot amount to the total amount of debt
     * @param percent Coefficient with 18 decimals, i.e. 90% is 0.9e18
     */
    function setMaxLotAmountFactor(uint256 percent)
        external
        onlyRole(ADMIN_ROLE)
    {
        maxLotAmountFactor = percent;
    }
}
