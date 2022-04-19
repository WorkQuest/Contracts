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

    uint256 lastArbiter;

    /// @notice Fee amount
    uint256 public feeEmployer;
    uint256 public feeWorker;

    /// @notice Address of Fee receiver
    address payable public feeReceiver;

    /// @notice Address of pension fund contract
    address payable public pensionFund;

    /// @notice address of referral
    address payable public referral;

    /// @notice Address of wusd token
    IERC20Upgradeable public wusd;

    /// @notice Mapping of employer address to list of workquest addresses
    mapping(address => address[]) public workquests;

    /// @notice Mapping for checking contract existing
    mapping(address => bool) public workquestValid;

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
     * @param _pensionFund Address of pension fund contract
     */
    function initialize(
        uint256 _feeEmployer,
        uint256 _feeWorker,
        address payable _feeReceiver,
        address payable _pensionFund,
        address payable _referral,
        address _wusd
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
        feeReceiver = _feeReceiver;
        pensionFund = _pensionFund;
        referral = _referral;
        wusd = IERC20Upgradeable(_wusd);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @notice Get list of adresses of employers workquests
     * @param employer Address of employer
     */
    function getWorkQuests(address employer)
        external
        view
        returns (address[] memory)
    {
        return workquests[employer];
    }

    /**
     * @notice Create new work quest contract
     * @param jobHash Hash of a text of a job offer
     * @param cost Job cost amount
     */
    function newWorkQuest(
        bytes32 jobHash,
        uint256 cost,
        uint256 deadline,
        uint256 nonce
    ) external {
        address workquest = address(
            new WorkQuest(
                jobHash,
                feeWorker,
                cost,
                deadline,
                msg.sender,
                feeReceiver,
                pensionFund,
                referral,
                address(wusd)
            )
        );
        workquests[msg.sender].push(workquest);
        workquestValid[workquest] = true;
        uint256 comission = (cost * feeEmployer) / 1e18;
        wusd.safeTransferFrom(msg.sender, workquest, cost);
        wusd.safeTransferFrom(msg.sender, feeReceiver, comission);
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
    function setFeeReceiver(address payable _feeReceiver)
        external
        onlyRole(ADMIN_ROLE)
    {
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Set address of refferal contract
     * @param _referral  Address of refferal contract
     */
    function setRefferal(address payable _referral)
        external
        onlyRole(ADMIN_ROLE)
    {
        referral = _referral;
    }

    /**
     * @notice Set address of pension fund contract
     * @param _pensionFund  Address of pension fund contract
     */
    function setPensionFund(address payable _pensionFund)
        external
        onlyRole(ADMIN_ROLE)
    {
        pensionFund = _pensionFund;
    }

    /**
     * @notice Set address of WUSD token
     * @param _wusd  Address of pension fund contract
     */
    function setWusd(address _wusd) external onlyRole(ADMIN_ROLE) {
        wusd = IERC20Upgradeable(_wusd);
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
}
