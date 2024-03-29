// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import './WorkQuest.sol';

contract WorkQuestFactory is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using AddressUpgradeable for address payable;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant ARBITER_ROLE = keccak256('ARBITER_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    struct ArbiterInfo {
        uint256 idx;
        bool status;
    }

    struct TokenSettings {
        IERC20Upgradeable token;
        bool enabled;
    }

    /// @notice Fee amount
    uint256 public feeEmployer;
    uint256 public feeWorker;
    uint256 public feeTx;

    /// @notice Address of Fee receiver
    address payable public feeReceiver;

    /// @notice Address of pension fund contract
    address payable public pensionFund;

    /// @notice address of referral
    address payable public referral;

    /// @notice Mapping of employer address to list of workquest addresses
    mapping(address => address[]) public workquests;

    /// @notice Mapping for checking contract existing
    mapping(address => bool) public workquestValid;

    /// @notice Settings of tokens
    mapping(string => TokenSettings) public assets;

    /// @notice Address of usdc token
    IERC20Upgradeable public usdc;

    /// @notice Address of usdt token
    IERC20Upgradeable public usdt;

    /**
     * @notice Event emited when new workquest contract created
     */
    event WorkQuestCreated(
        bytes32 jobHash,
        address employer,
        address workquest,
        uint256 createdAt,
        uint256 nonce
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice Create new WorkQuestFactory contract
     * @param _feeEmployer Fee of jobs cost
     * @param _feeWorker Fee of jobs cost
     * @param _feeReceiver Address of reciever of fee
     */

    function initialize(
        uint256 _feeEmployer,
        uint256 _feeWorker,
        uint256 _feeTx,
        address payable _feeReceiver,
        address payable _pensionFund,
        address payable _referral
    ) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(ARBITER_ROLE, ADMIN_ROLE);
        feeEmployer = _feeEmployer;
        feeWorker = _feeWorker;
        feeTx = _feeTx;
        feeReceiver = _feeReceiver;
        pensionFund = _pensionFund;
        referral = _referral;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice Get list of adresses of employers workquests
     * @param employer Address of employer
     */
    function getWorkQuests(
        address employer,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory page) {
        address[] storage quests = workquests[employer];
        if (limit > quests.length - offset) {
            limit = quests.length - offset;
        }
        page = new address[](limit);
        for (uint256 i = 0; i < limit; i++) {
            page[i] = quests[offset + i];
        }
        return page;
    }

    /**
     * @notice Create new work quest contract
     * @param jobHash Hash of a text of a job offer
     * @param cost Job cost amount
     */
    function newWorkQuest(
        bytes32 jobHash,
        uint256 cost,
        string memory symbol,
        uint256 deadline,
        uint256 nonce
    ) external {
        address workquest = address(
            new WorkQuest(jobHash, cost, symbol, deadline, msg.sender)
        );
        workquests[msg.sender].push(workquest);
        workquestValid[workquest] = true;
        uint256 comission;
        if (
            assets[symbol].token == assets['USDT'].token ||
            assets[symbol].token == assets['USDC'].token
        ) {
            comission = (cost * feeEmployer) / 1e6;
            assets[symbol].token.safeTransferFrom(msg.sender, workquest, cost);
            assets[symbol].token.safeTransferFrom(
                msg.sender,
                feeReceiver,
                comission
            );
        } else {
            comission = (cost * feeEmployer) / 1e18;
            assets[symbol].token.safeTransferFrom(msg.sender, workquest, cost);
            assets[symbol].token.safeTransferFrom(
                msg.sender,
                feeReceiver,
                comission
            );
        }
        emit WorkQuestCreated(
            jobHash,
            msg.sender,
            workquest,
            block.timestamp,
            nonce
        );
    }

    /**
     * @notice Set address of fee receiver
     * @param _feeReceiver Address of fee receiver
     */
    function setFeeReceiver(
        address payable _feeReceiver
    ) external onlyRole(ADMIN_ROLE) {
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Set address of refferal contract
     * @param _referral  Address of refferal contract
     */
    function setRefferal(
        address payable _referral
    ) external onlyRole(ADMIN_ROLE) {
        referral = _referral;
    }

    /**
     * @notice Set address of pension fund contract
     * @param _pensionFund  Address of pension fund contract
     */
    function setPensionFund(
        address payable _pensionFund
    ) external onlyRole(ADMIN_ROLE) {
        pensionFund = _pensionFund;
    }

    /**
     * @notice Set fee value for employer
     */
    function setFeeEmployer(uint256 _fee) external onlyRole(ADMIN_ROLE) {
        feeEmployer = _fee;
    }

    function setFeeWorker(uint256 _fee) external onlyRole(ADMIN_ROLE) {
        feeWorker = _fee;
    }

    function setFeeTx(uint256 _fee) external onlyRole(ADMIN_ROLE) {
        feeTx = _fee;
    }

    function setToken(
        address _token,
        bool _enabled,
        string memory _symbol
    ) public onlyRole(ADMIN_ROLE) {
        require(
            bytes(_symbol).length > 0,
            'WorkQuest Factory: Symbol length must be greater than 0'
        );
        assets[_symbol] = TokenSettings(IERC20Upgradeable(_token), _enabled);
    }

    /**
     * @notice Set address of usdc token
     * @param _usdc  Address of usdc token
     */
    function setUsdc(address _usdc) external onlyRole(ADMIN_ROLE) {
        usdc = IERC20Upgradeable(_usdc);
    }

    /**
     * @notice Set address of usdt token
     * @param _usdt  Address of usdt token
     */
    function setUsdt(address _usdt) external onlyRole(ADMIN_ROLE) {
        usdt = IERC20Upgradeable(_usdt);
    }
}
