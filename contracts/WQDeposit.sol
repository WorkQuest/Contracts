// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import './WQPriceOracle.sol';
import './WQFundInterface.sol';

contract WQDeposit is
    WQFundInterface,
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant BORROWER_ROLE = keccak256('BORROWER_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    uint256 public contributed;
    uint256 public borrowed;

    /// @notice Event emitted when funds withrew from contract
    event Borrowed(uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(address _oracle) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
        oracle = WQPriceOracle(_oracle);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * TODO: implement it
     * @notice Contribute native moneys to contract
     */
    function contribute() external payable nonReentrant {}

    function balanceOf() external view override returns (uint256) {
        return contributed - borrowed;
    }

    function borrow(uint256 amount) external override nonReentrant {
        require(
            hasRole(BORROWER_ROLE, msg.sender),
            "WQPension: You don't have a borrower role"
        );
        require(
            amount <= contributed - borrowed,
            'WQPension: Insuffience amount'
        );
        borrowed += amount;
        payable(msg.sender).transfer(amount);
        emit Borrowed(amount);
    }

    // TODO: implement it
    function refund() external payable override {}

    receive() external payable {
        revert();
    }
}
