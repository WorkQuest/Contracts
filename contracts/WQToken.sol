// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

contract WQToken {
    /// @notice Checkpoint structure
    struct Checkpoint {
        uint32 fromBlock;
        uint224 votes;
    }

    /// @notice EIP-20 token name for this token
    string public constant name = "WorkQuest Token";

    /// @notice EIP-20 token symbol for this token
    string public constant symbol = "WQT";

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

    bool private _initialized;

    /// @notice
    mapping(address => address) private _delegates;

    /// @notice
    mapping(address => Checkpoint[]) private _checkpoints;

    /// @notice
    mapping(address => uint256) private _balances;

    /// @notice maps user's address to voteToken balance
    mapping(address => uint256) private _voteLockedTokenBalance;

    /// @notice
    mapping(address => mapping(address => uint256)) private _allowances;

    /// @notice Bridge address
    address public bridge;

    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    /**
     * @dev Emitted when an account changes their delegate.
     */
    event DelegateChanged(
        address indexed delegator,
        address indexed fromDelegate,
        address indexed toDelegate
    );

    /**
     * @dev Emitted when a token transfer or delegate change results in changes to an account's voting power.
     */
    event DelegateVotesChanged(
        address indexed delegate,
        uint256 previousBalance,
        uint256 newBalance
    );

    function initialize(uint256 initialSupply) external {
        require(
            !_initialized,
            "WQT: Contract instance has already been initialized"
        );
        _initialized = true;
        owner = msg.sender;
        _mint(owner, initialSupply);
    }

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function votePowerOf(address account) public view returns (uint256) {
        return _voteLockedTokenBalance[account];
    }

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * @return A boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount) public returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
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
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address account, uint256 amount) public returns (bool) {
        _approve(msg.sender, account, amount);
        return true;
    }

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public returns (bool) {
        _transfer(sender, recipient, amount);

        uint256 currentAllowance = _allowances[sender][msg.sender];
        require(
            currentAllowance >= amount,
            "WQT: transfer amount exceeds allowance"
        );
        unchecked {
            _approve(sender, msg.sender, currentAllowance - amount);
        }

        return true;
    }

    /**
     * @dev Atomically increases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
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
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `spender` must have allowance for the caller of at least
     * `subtractedValue`.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue)
        public
        returns (bool)
    {
        uint256 currentAllowance = _allowances[msg.sender][spender];
        require(
            currentAllowance >= subtractedValue,
            "WQT: decreased allowance below zero"
        );
        unchecked {
            _approve(msg.sender, spender, currentAllowance - subtractedValue);
        }

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
        require(msg.sender == bridge, "WQT: Sender should be a bridge");
        _mint(account, amount);
    }

    /**
     * @notice Burn token, when swap initialized in bridge
     * @param account Address of an account
     * @param amount Amount of tokens
     *
     * Requirements: msg.sender should be a bridge address
     */
    function burn(address account, uint256 amount) external {
        require(msg.sender == bridge, "WQT: Sender should be a bridge");
        _burn(account, amount);
    }

    /**
     * @notice Set address of bridge for swap token
     * @param _bridge Address of bridge
     * Requirements: msg.sender should be an owner
     */
    function setBridge(address _bridge) external {
        require(msg.sender == owner, "WQT: Sender should be a owner");
        bridge = _bridge;
    }

    /**
     * @dev Get the `pos`-th checkpoint for `account`.
     */
    function checkpoints(address account, uint32 pos)
        public
        view
        returns (Checkpoint memory)
    {
        return _checkpoints[account][pos];
    }

    /**
     * @dev Get number of checkpoints for `account`.
     */
    function numCheckpoints(address account) public view returns (uint32) {
        return SafeCast.toUint32(_checkpoints[account].length);
    }

    /**
     * @dev Get the address `account` is currently delegating to.
     */
    function delegates(address account) public view returns (address) {
        return _delegates[account];
    }

    /**
     * @dev Gets the current votes balance for `account`
     */
    function getVotes(address account) public view returns (uint256) {
        uint256 pos = _checkpoints[account].length;
        return pos == 0 ? 0 : _checkpoints[account][pos - 1].votes;
    }

    /**
     * @dev Retrieve the number of votes for `account` at the end of `blockNumber`.
     * Requirements:
     * - `blockNumber` must have been already mined
     */
    function getPastVotes(address account, uint256 blockNumber)
        public
        view
        returns (uint256)
    {
        require(blockNumber < block.number, "WQT: block not yet mined");
        return _checkpointsLookup(_checkpoints[account], blockNumber);
    }

    /**
     * @dev Delegate votes from the sender to `delegatee`.
     */
    function delegate(address delegatee, uint256 amount) public {
        return _delegate(msg.sender, delegatee, amount);
    }

    function withdrawVotingRights(address delegatee, uint256 amount) public {
        require(_voteLockedTokenBalance[delegatee] >= amount);
        require(
            delegatee != address(0),
            "WQT: Cant't withdraw from the zero address"
        );
        _voteLockedTokenBalance[delegatee] -= amount;
        _balances[msg.sender] += amount;
        _moveVotingPower(
            delegatee,
            msg.sender,
            _voteLockedTokenBalance[delegatee]
        );
    }

    /**
     * @dev Set the address of the sale contract.
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
            msg.sender == owner && _saleContract == address(0),
            "WQT: Caller must be owner and _saleContract yet unset"
        );
        _saleContract = saleContract;
    }

    /**
     * @dev Lock token transfers.
     *
     * Added by WorkQuest Team.
     *
     */
    function lockTransfers() public {
        require(
            msg.sender == owner && !_unlockFixed,
            "WQT: Caller must be owner and _unlockFixed false"
        );
        _locked = true;
    }

    /**
     * @dev Unlock token transfers.
     *
     * Added by WorkQuest Team.
     *
     */
    function unlockTransfers() public {
        require(
            msg.sender == owner && !_unlockFixed,
            "WQT: Caller must be owner and _unlockFixed false"
        );
        _locked = false;
    }

    /**
     * @dev Permanently unlock token transfers.
     * After this, further locking is impossible.
     *
     * Added by WorkQuest Team.
     *
     */
    function unlockTransfersPermanent() public {
        require(
            msg.sender == owner && !_unlockFixed,
            "WQT: Caller must be owner and _unlockFixed false"
        );
        _locked = false;
        _unlockFixed = true;
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal {
        require(sender != address(0), "WQT: transfer from the zero address");
        require(recipient != address(0), "WQT: transfer to the zero address");

        _beforeTokenTransfer();

        uint256 senderBalance = _balances[sender];
        require(
            senderBalance >= amount,
            "WQT: transfer amount exceeds balance"
        );
        unchecked {
            _balances[sender] = senderBalance - amount;
        }
        _balances[recipient] += amount;

        emit Transfer(sender, recipient, amount);
    }

    function _approve(
        address account,
        address spender,
        uint256 amount
    ) internal {
        require(account != address(0), "WQT: approve from the zero address");
        require(spender != address(0), "WQT: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
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
            "WQT: Cant't delegate fromt the zero address"
        );
        require(
            delegatee != address(0),
            "WQT: Cant't delegate to the zero address"
        );
        require(
            amount <= _balances[delegator],
            "WQT: Not enough balance to delegate"
        );
        address currentDelegate = delegates(delegator);
        _voteLockedTokenBalance[delegatee] += amount;
        _balances[delegator] -= amount;
        _delegates[delegator] = delegatee;

        emit DelegateChanged(delegator, currentDelegate, delegatee);

        _moveVotingPower(
            currentDelegate,
            delegatee,
            _voteLockedTokenBalance[delegatee]
        );
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
            uint256 mid = Math.average(low, high);
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
            ckpts[pos - 1].votes = SafeCast.toUint224(newWeight);
        } else {
            ckpts.push(
                Checkpoint({
                    fromBlock: SafeCast.toUint32(block.number),
                    votes: SafeCast.toUint224(newWeight)
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

    function getChainId() internal view returns (uint256) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return chainId;
    }

    /**
     * @dev Maximum token supply. Defaults to `type(uint224).max` (2^224^ - 1).
     */
    function _maxSupply() internal pure returns (uint224) {
        return type(uint224).max;
    }

    /** @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function _mint(address account, uint256 amount) internal {
        require(account != address(0), "WQT: mint to the zero address");
        require(
            totalSupply <= _maxSupply(),
            "WQT: total supply risks overflowing votes"
        );

        _beforeTokenTransfer();

        totalSupply += amount;
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    /**
     * @dev Destroys `amount` tokens from `account`, reducing the
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
        require(account != address(0), "WQT: burn from the zero address");

        _beforeTokenTransfer();

        uint256 accountBalance = _balances[account];
        require(accountBalance >= amount, "WQT: burn amount exceeds balance");
        unchecked {
            _balances[account] = accountBalance - amount;
        }
        totalSupply -= amount;

        emit Transfer(account, address(0), amount);
    }

    /**
     * @dev Hook that is called before any transfer of tokens. This includes
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
    function _beforeTokenTransfer() internal view {
        require(
            !_locked || msg.sender == _saleContract,
            "WQT: Transfers locked"
        );
    }
}
