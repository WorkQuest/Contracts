// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol';

contract WQToken is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant MINTER_ROLE = keccak256('MINTER_ROLE');
    bytes32 public constant BURNER_ROLE = keccak256('BURNER_ROLE');
    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

    /// @notice Checkpoint structure
    struct Checkpoint {
        uint32 fromBlock;
        uint224 votes;
    }

    /// @notice EIP-20 token name for this token
    string public constant name = 'WorkQuest Token';

    /// @notice EIP-20 token symbol for this token
    string public constant symbol = 'WQT';

    /// @notice EIP-20 token decimals for this token
    uint8 public constant decimals = 18;

    /// @notice Total number of tokens in circulation
    uint256 public totalSupply;

    /// @notice Transfer token is locked while _locked is true
    bool private _locked;

    /// @notice Locking of transfer is impossible if _unlockFixed is true
    bool private _unlockFixed;

    address private _saleContract;

    /// @notice Address of an owner
    address public owner;

    mapping(address => address) private _delegates;

    mapping(address => Checkpoint[]) private _checkpoints;

    mapping(address => uint256) private _balances;

    mapping(address => uint256) private _voteLockedTokenBalance;

    mapping(address => uint256) private _freezings;

    mapping(address => mapping(address => uint256)) private _allowances;

    /**
     * @notice Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @notice Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    /**
     * @notice Emitted when an account changes their delegate.
     */
    event DelegateChanged(
        address indexed delegator,
        address indexed fromDelegate,
        address indexed toDelegate
    );

    /**
     * @notice Emitted when a token transfer or delegate change results in changes to an account's voting power.
     */
    event DelegateVotesChanged(
        address indexed delegate,
        uint256 previousBalance,
        uint256 newBalance
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(uint256 initialSupply) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        owner = msg.sender;
        _mint(owner, initialSupply);
        _setupRole(DEFAULT_ADMIN_ROLE, owner);
        _setupRole(ADMIN_ROLE, owner);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setRoleAdmin(MINTER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(BURNER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(UPGRADER_ROLE, ADMIN_ROLE);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @notice Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    /**
     * @notice Moves `amount` tokens from the caller's account to `recipient`. Emits a {Transfer} event.
     * @param recipient Recipient address
     * @param amount Amount value
     * @return A boolean value indicating whether the operation succeeded.
     */
    function transfer(address recipient, uint256 amount) public returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    /**
     * @notice Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default. This value changes when {approve} or {transferFrom} are called.
     * @param account Address of owner
     * @param spender Address of spender
     */
    function allowance(address account, address spender)
        public
        view
        returns (uint256)
    {
        return _allowances[account][spender];
    }

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     * Emits an {Approval} event.
     * @param account Address of owner
     * @param amount Amount value
     * @return A boolean value indicating whether the operation succeeded.
     */
    function approve(address account, uint256 amount) public returns (bool) {
        _approve(msg.sender, account, amount);
        return true;
    }

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance. Emits a {Transfer} event.
     * @param sender Sender address
     * @param recipient Recipient address
     * @param amount Amount of coins
     * @return A boolean value indicating whether the operation succeeded.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public returns (bool) {
        require(
            amount <= _allowances[sender][msg.sender],
            'WQT: Transfer amount exceeds allowance'
        );
        _transfer(sender, recipient, amount);
        _approve(sender, msg.sender, _allowances[sender][msg.sender] - amount);
        return true;
    }

    /**
     * @dev Atomically increases the allowance granted to spender by the caller. Emits an {Approval} event indicating the updated allowance.
     * @param spender cannot be the zero address
     * @param addedValue added value
     */
    function increaseAllowance(address spender, uint256 addedValue)
        public
        returns (bool)
    {
        _approve(
            msg.sender,
            spender,
            _allowances[msg.sender][spender] + addedValue
        );
        return true;
    }

    /**
     * @dev Atomically decreases the allowance granted to `spender` by the caller.
     * Emits an {Approval} event indicating the updated allowance.
     * @param spender cannot be the zero address and must have allowance for the caller of at least subtractedValue.
     * @param subtractedValue subtracted value
     */
    function decreaseAllowance(address spender, uint256 subtractedValue)
        public
        returns (bool)
    {
        require(
            subtractedValue <= _allowances[msg.sender][spender],
            'WQT: Decreased allowance below zero'
        );
        _approve(
            msg.sender,
            spender,
            _allowances[msg.sender][spender] - subtractedValue
        );

        return true;
    }

    /**
     * @notice Mint token, when swap redeemed in bridge
     * @param account Address of an account
     * @param amount Amount of tokens
     *
     * Requirements: msg.sender should be a bridge address
     */
    function mint(address account, uint256 amount) external {
        require(
            hasRole(MINTER_ROLE, msg.sender),
            'WQT: Sender should be a bridge'
        );
        _mint(account, amount);
    }

    /**
     * @notice Burn token, when swap initialized in bridge. msg.sender should be a burner role
     * @param account Address of an account
     * @param amount Amount of tokens
     */
    function burn(address account, uint256 amount) external {
        require(
            hasRole(BURNER_ROLE, msg.sender),
            'WQT: Sender should be a bridge'
        );
        _burn(account, amount);
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal {
        require(sender != address(0), 'WQT: transfer from the zero address');
        require(recipient != address(0), 'WQT: transfer to the zero address');

        _beforeTokenTransfer(sender, recipient, amount);
        _balances[sender] -= amount;
        _balances[recipient] += amount;

        emit Transfer(sender, recipient, amount);
    }

    function _approve(
        address account,
        address spender,
        uint256 amount
    ) internal {
        require(account != address(0), 'WQT: approve from the zero address');
        require(spender != address(0), 'WQT: approve to the zero address');

        _allowances[account][spender] = amount;
        emit Approval(account, spender, amount);
    }

    /**
     * @dev Maximum token supply. Defaults to `type(uint224).max` (2^224^ - 1).
     */
    function _maxSupply() internal pure returns (uint224) {
        return type(uint224).max;
    }

    /** @notice Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function _mint(address account, uint256 amount) internal {
        require(account != address(0), 'WQT: mint to the zero address');
        totalSupply += amount;
        require(
            totalSupply <= _maxSupply(),
            'WQT: total supply risks overflowing votes'
        );
        _beforeTokenTransfer(address(0), account, amount);
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    /**
     * @notice Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function _burn(address account, uint256 amount) internal {
        require(account != address(0), 'WQT: burn from the zero address');
        _beforeTokenTransfer(account, address(0), amount);

        totalSupply -= amount;
        _balances[account] -= amount;
        emit Transfer(account, address(0), amount);
    }

    /**
     * @notice Hook that is called before any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * will be transferred to `to`.
     * - when `from` is zero, `amount` tokens will be minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens will be burned.
     * - `from` and `to` are never both zero.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     *
     * address from,
     * address to,
     * uint256 amount
     */
    function _beforeTokenTransfer(
        address from,
        address,
        uint256 amount
    ) internal view {
        require(
            !_locked || msg.sender == _saleContract,
            'WQT: Transfers locked'
        );
        if (from != address(0)) {
            require(
                amount <= _balances[from] - _freezings[from],
                'WQT: Token amount exceeds balance'
            );
        }
    }

    /**
     * @notice DAO Voting functions
     */

    /**
     * @notice Returns the amount of locked tokens
     */
    function freezed(address account) public view returns (uint256) {
        return _freezings[account];
    }

    /**
     * @notice Get the `pos`-th checkpoint for `account`.
     */
    function checkpoints(address account, uint32 pos)
        public
        view
        returns (Checkpoint memory)
    {
        return _checkpoints[account][pos];
    }

    /**
     * @notice Get number of checkpoints for `account`.
     */
    function numCheckpoints(address account) public view returns (uint32) {
        return SafeCastUpgradeable.toUint32(_checkpoints[account].length);
    }

    /**
     * @notice Get the address `account` is currently delegating to.
     */
    function delegates(address account) public view returns (address) {
        return _delegates[account];
    }

    /**
     * @notice Gets the current votes balance for `account`
     */
    function getVotes(address[] calldata accounts)
        public
        view
        returns (uint256[] memory _delegatee)
    {
        _delegatee = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            uint256 pos = _checkpoints[accounts[i]].length;
            _delegatee[i] = pos == 0
                ? 0
                : _checkpoints[accounts[i]][pos - 1].votes;
        }
        return _delegatee;
    }

    /**
     * @notice Gets the current votes balance for `account`
     */
    // function getVotes(address account) public view returns (uint256) {
    //     uint256 pos = _checkpoints[account].length;
    //     return pos == 0 ? 0 : _checkpoints[account][pos - 1].votes;
    // }

    /**
     * @notice Retrieve the number of votes for `account` at the end of `blockNumber`.
     * Requirements:
     * - `blockNumber` must have been already mined
     */
    function getPastVotes(address account, uint256 blockNumber)
        public
        view
        returns (uint256)
    {
        require(blockNumber < block.number, 'WQT: block not yet mined');
        return _checkpointsLookup(_checkpoints[account], blockNumber);
    }

    /**
     * @notice Delegate votes from the sender to `delegatee`.
     */
    function delegate(address delegatee, uint256 amount) public {
        return _delegate(msg.sender, delegatee, amount);
    }

    /**
     * @dev Change delegation for `delegator` to `delegatee`.
     */
    function _delegate(
        address delegator,
        address delegatee,
        uint256 amount
    ) internal {
        require(
            delegator != address(0),
            "WQT: Cant't delegate from the zero address"
        );
        require(
            delegatee != address(0),
            "WQT: Cant't delegate to the zero address"
        );
        require(
            amount <= _balances[delegator],
            'WQT: Not enough balance to delegate'
        );
        emit DelegateChanged(delegator, _delegates[delegator], delegatee);
        _moveVotingPower(
            _delegates[delegator],
            address(0),
            _freezings[delegator]
        );
        _moveVotingPower(address(0), delegatee, amount);
        _freezings[delegator] = amount;
        _delegates[delegator] = delegatee;
    }

    function undelegate() public {
        _undelegate(msg.sender);
    }

    function _undelegate(address delegator) internal {
        emit DelegateChanged(delegator, _delegates[delegator], address(0));
        _moveVotingPower(
            _delegates[delegator],
            address(0),
            _freezings[delegator]
        );
        _freezings[delegator] = 0;
        delete _delegates[msg.sender];
    }

    function _moveVotingPower(
        address src,
        address dst,
        uint256 amount
    ) private {
        if (src != dst && amount > 0) {
            if (src != address(0)) {
                (uint256 oldWeight, uint256 newWeight) = _writeCheckpoint(
                    _checkpoints[src],
                    _subtract,
                    amount
                );
                emit DelegateVotesChanged(src, oldWeight, newWeight);
            }

            if (dst != address(0)) {
                (uint256 oldWeight, uint256 newWeight) = _writeCheckpoint(
                    _checkpoints[dst],
                    _add,
                    amount
                );
                emit DelegateVotesChanged(dst, oldWeight, newWeight);
            }
        }
    }

    /**
     * @dev Lookup a value in a list of (sorted) checkpoints.
     */
    function _checkpointsLookup(Checkpoint[] storage ckpts, uint256 blockNumber)
        private
        view
        returns (uint256)
    {
        uint256 high = ckpts.length;
        uint256 low = 0;
        while (low < high) {
            uint256 mid = MathUpgradeable.average(low, high);
            if (ckpts[mid].fromBlock > blockNumber) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        return high == 0 ? 0 : ckpts[high - 1].votes;
    }

    function _writeCheckpoint(
        Checkpoint[] storage ckpts,
        function(uint256, uint256) view returns (uint256) op,
        uint256 delta
    ) private returns (uint256 oldWeight, uint256 newWeight) {
        uint256 pos = ckpts.length;
        oldWeight = pos == 0 ? 0 : ckpts[pos - 1].votes;
        newWeight = op(oldWeight, delta);

        if (pos > 0 && ckpts[pos - 1].fromBlock == block.number) {
            ckpts[pos - 1].votes = SafeCastUpgradeable.toUint224(newWeight);
        } else {
            ckpts.push(
                Checkpoint({
                    fromBlock: SafeCastUpgradeable.toUint32(block.number),
                    votes: SafeCastUpgradeable.toUint224(newWeight)
                })
            );
        }
    }

    function _add(uint256 a, uint256 b) private pure returns (uint256) {
        return a + b;
    }

    function _subtract(uint256 a, uint256 b) private pure returns (uint256) {
        return a - b;
    }

    /**
     * @notice Admin functions
     */

    /**
     * @notice Set the address of the sale contract.
     * `saleContract` can make token transfers
     * even when the token contract state is locked.
     * Transfer lock serves the purpose of preventing
     * the creation of fake Uniswap pools.
     *
     * Added by WorkQuest Team.
     *
     */
    function setSaleContract(address saleContract) public {
        require(
            hasRole(ADMIN_ROLE, msg.sender) && _saleContract == address(0),
            'WQT: Caller must be owner and _saleContract yet unset'
        );
        _saleContract = saleContract;
    }

    /**
     * @notice Lock token transfers.
     *
     * Added by WorkQuest Team.
     *
     */
    function lockTransfers() public {
        require(
            hasRole(ADMIN_ROLE, msg.sender) && !_unlockFixed,
            'WQT: Caller must be owner and _unlockFixed false'
        );
        _locked = true;
    }

    /**
     * @notice Unlock token transfers.
     *
     * Added by WorkQuest Team.
     *
     */
    function unlockTransfers() public {
        require(
            hasRole(ADMIN_ROLE, msg.sender) && !_unlockFixed,
            'WQT: Caller must be owner and _unlockFixed false'
        );
        _locked = false;
    }

    /**
     * @notice Permanently unlock token transfers.
     * After this, further locking is impossible.
     *
     * Added by WorkQuest Team.
     *
     */
    function unlockTransfersPermanent() public {
        require(
            hasRole(ADMIN_ROLE, msg.sender) && !_unlockFixed,
            'WQT: Caller must be owner and _unlockFixed false'
        );
        _locked = false;
        _unlockFixed = true;
    }
}
