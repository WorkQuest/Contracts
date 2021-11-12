// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';

import './WorkQuest.sol';

contract WorkQuestFactory is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    struct ArbiterInfo {
        uint256 idx;
        bool status;
    }

    uint256 lastArbiter;

    /// @notice Fee amount
    uint256 public fee;

    /// @notice Address of Fee receiver
    address payable public feeReceiver;

    /// @notice Address of pension fund contract
    address payable public pensionFund;

    /// @notice address of referral
    address payable public referral;

    /// @notice Mapping of employer address to list of workquest addresses
    mapping(address => address[]) public workquests;

    /// @notice Mapping of arbiters adresses to boolean enabled
    mapping(address => ArbiterInfo) public arbiters;

    /// @notice Mapping for checking contract existing
    mapping(address => bool) public workquestValid;

    /// @notice List of arbiters adresses
    address payable[] public arbiterList;

    /**
     * @notice Event emited when new workquest contract created
     */
    event WorkQuestCreated(
        bytes32 jobHash,
        address employer,
        address workquest,
        uint256 createdAt
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice Create new WorkQuestFactory contract
     * @param _fee Fee of jobs cost
     * @param _feeReceiver Address of reciever of fee
     * @param _pensionFund Address of pension fund contract
     */
    function initialize(
        uint256 _fee,
        address payable _feeReceiver,
        address payable _pensionFund,
        address payable _referral
    ) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        fee = _fee;
        feeReceiver = _feeReceiver;
        pensionFund = _pensionFund;
        referral = _referral;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
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
     * @return workquest Address of workquest contract
     */
    function newWorkQuest(
        bytes32 jobHash,
        uint256 cost,
        uint256 deadline
    ) external returns (address workquest) {
        workquest = address(
            new WorkQuest(
                jobHash,
                fee,
                cost,
                deadline,
                feeReceiver,
                pensionFund,
                payable(msg.sender),
                getArbiter(),
                referral
            )
        );
        workquests[msg.sender].push(workquest);
        workquestValid[workquest] = true;
        emit WorkQuestCreated(jobHash, msg.sender, workquest, block.timestamp);
        return workquest;
    }

    /**
     * @notice Enable or disable address of arbiter
     * @param _arbiter Address of arbiter
     * @param _enabled true - enable arbiter address, false - disable
     */
    function updateArbiter(address payable _arbiter, bool _enabled)
        external
        onlyRole(ADMIN_ROLE)
    {
        ArbiterInfo storage a = arbiters[_arbiter];
        if (arbiterList.length == 0 || arbiterList[a.idx] != _arbiter) {
            a.idx = arbiterList.length;
            arbiterList.push(_arbiter);
        }
        a.status = _enabled;
    }

    function allArbiters() external view returns (address payable[] memory) {
        return arbiterList;
    }

    /**
     * @notice Update address of fee receiver
     * @param _feeReceiver Address of fee receiver
     */
    function updateFeeReceiver(address payable _feeReceiver)
        external
        onlyRole(ADMIN_ROLE)
    {
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Update address of refferal contract
     * @param _referral  Address of refferal contract
     */
    function updateRefferal(address payable _referral)
        external
        onlyRole(ADMIN_ROLE)
    {
        referral = _referral;
    }

    /**
     * @notice Get next enabled arbiter
     */
    function getArbiter() internal returns (address payable) {
        for (uint256 i = 0; i < arbiterList.length; i++) {
            lastArbiter++;
            if (lastArbiter >= arbiterList.length) lastArbiter = 0;
            if (arbiters[arbiterList[lastArbiter]].status) break;
        }
        return arbiterList[lastArbiter];
    }
}
