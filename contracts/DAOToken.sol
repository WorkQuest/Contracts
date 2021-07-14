// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.4;
// pragma experimental ABIEncoderV2;

// import "@openzeppelin/contracts/utils/math/SafeMath.sol";
// import "@openzeppelin/contracts/utils/math/Math.sol";
// import "@openzeppelin/contracts/utils/math/SafeCast.sol";
// import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
// import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
// import "@openzeppelin/contracts/utils/Counters.sol";

// contract DAO_Token_def {
//     using ECDSA for bytes32;
//     using Counters for Counters.Counter;

//     /// @notice EIP-20 token name for this token
//     string public constant name = "DAO_Token";

//     /// @notice EIP-20 token symbol for this token
//     string public constant symbol = "DOT";

//     /// @notice EIP-20 token decimals for this token
//     uint8 public constant decimals = 18;

//     bytes32 public constant DOMAIN_TYPEHASH =
//         keccak256(
//             "EIP712Domain(string name,uint256 chainId,address verifyingContract)"
//         );

//     /// @notice Total number of tokens in circulation
//     uint256 public _totalSupply = 100000000e18; // 10 million Comp

//     address public owner;

//     bytes32 private constant DELEGATION_TYPEHASH =
//         keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)");

//     struct Checkpoint {
//         uint32 fromBlock;
//         uint224 votes;
//     }

//     mapping(address => address) private _delegates;

//     mapping(address => Checkpoint[]) private _checkpoints;
//     Checkpoint[] private _totalSupplyCheckpoints;

//     mapping(address => Counters.Counter) private _nonces;

//     mapping(address => uint256) private _balances;

//     mapping(address => mapping(address => uint256)) private _allowances;

//     event Transfer(address indexed from, address indexed to, uint256 value);
//     event Approval(
//         address indexed owner,
//         address indexed spender,
//         uint256 value
//     );

//     /**
//      * @dev Emitted when an account changes their delegate.
//      */
//     event DelegateChanged(
//         address indexed delegator,
//         address indexed fromDelegate,
//         address indexed toDelegate
//     );

//     /**
//      * @dev Emitted when a token transfer or delegate change results in changes to an account's voting power.
//      */
//     event DelegateVotesChanged(
//         address indexed delegate,
//         uint256 previousBalance,
//         uint256 newBalance
//     );

//     constructor() {
//         owner = msg.sender;
//         _mint(owner, _totalSupply);
//         emit Transfer(address(0), owner, _totalSupply);
//     }

//     function balanceOf(address account) public view returns (uint256) {
//         return _balances[account];
//     }

//     function transfer(address recipient, uint256 amount) public returns (bool) {
//         _transfer(msg.sender, recipient, amount);
//         return true;
//     }

//     function allowance(address account, address spender)
//         public
//         view
//         returns (uint256)
//     {
//         return _allowances[account][spender];
//     }

//     function approve(address account, uint256 amount) public returns (bool) {
//         _approve(msg.sender, account, amount);
//         return true;
//     }

//     function transferFrom(
//         address sender,
//         address recipient,
//         uint256 amount
//     ) public returns (bool) {
//         _transfer(sender, recipient, amount);

//         uint256 currentAllowance = _allowances[sender][msg.sender];
//         require(
//             currentAllowance >= amount,
//             "ERC20: transfer amount exceeds allowance"
//         );
//         unchecked {
//             _approve(sender, msg.sender, currentAllowance - amount);
//         }

//         return true;
//     }

//     function increaseAllowance(address spender, uint256 addedValue)
//         public
//         returns (bool)
//     {
//         _approve(
//             msg.sender,
//             spender,
//             _allowances[msg.sender][spender] + addedValue
//         );
//         return true;
//     }

//     function decreaseAllowance(address spender, uint256 subtractedValue)
//         public
//         returns (bool)
//     {
//         uint256 currentAllowance = _allowances[msg.sender][spender];
//         require(
//             currentAllowance >= subtractedValue,
//             "ERC20: decreased allowance below zero"
//         );
//         unchecked {
//             _approve(msg.sender, spender, currentAllowance - subtractedValue);
//         }

//         return true;
//     }

//     function _transfer(
//         address sender,
//         address recipient,
//         uint256 amount
//     ) internal virtual {
//         require(sender != address(0), "ERC20: transfer from the zero address");
//         require(recipient != address(0), "ERC20: transfer to the zero address");

//         _beforeTokenTransfer(sender, recipient, amount);

//         uint256 senderBalance = _balances[sender];
//         require(
//             senderBalance >= amount,
//             "ERC20: transfer amount exceeds balance"
//         );
//         unchecked {
//             _balances[sender] = senderBalance - amount;
//         }
//         _balances[recipient] += amount;

//         emit Transfer(sender, recipient, amount);

//         _afterTokenTransfer(sender, recipient, amount);
//     }

//     function _mint(address account, uint256 amount) internal virtual {
//         require(account != address(0), "ERC20: mint to the zero address");

//         _beforeTokenTransfer(address(0), account, amount);

//         _totalSupply += amount;
//         _balances[account] += amount;
//         emit Transfer(address(0), account, amount);

//         _afterTokenTransfer(address(0), account, amount);
//         _writeCheckpoint(_totalSupplyCheckpoints, _add, amount);
//     }

//     function _burn(address account, uint256 amount) internal virtual {
//         require(account != address(0), "ERC20: burn from the zero address");

//         _beforeTokenTransfer(account, address(0), amount);

//         uint256 accountBalance = _balances[account];
//         require(accountBalance >= amount, "ERC20: burn amount exceeds balance");
//         unchecked {
//             _balances[account] = accountBalance - amount;
//         }
//         _totalSupply -= amount;

//         emit Transfer(account, address(0), amount);
//         _afterTokenTransfer(account, address(0), amount);
//         _writeCheckpoint(_totalSupplyCheckpoints, _subtract, amount);
//     }

//     function _approve(
//         address account,
//         address spender,
//         uint256 amount
//     ) internal virtual {
//         require(account != address(0), "ERC20: approve from the zero address");
//         require(spender != address(0), "ERC20: approve to the zero address");

//         _allowances[owner][spender] = amount;
//         emit Approval(owner, spender, amount);
//     }

//     function _beforeTokenTransfer(
//         address from,
//         address to,
//         uint256 amount
//     ) internal virtual {}

//     /**
//      * @dev Get the `pos`-th checkpoint for `account`.
//      */
//     function checkpoints(address account, uint32 pos)
//         public
//         view
//         virtual
//         returns (Checkpoint memory)
//     {
//         return _checkpoints[account][pos];
//     }

//     /**
//      * @dev Get number of checkpoints for `account`.
//      */
//     function numCheckpoints(address account)
//         public
//         view
//         virtual
//         returns (uint32)
//     {
//         return SafeCast.toUint32(_checkpoints[account].length);
//     }

//     /**
//      * @dev Get the address `account` is currently delegating to.
//      */
//     function delegates(address account) public view virtual returns (address) {
//         return _delegates[account];
//     }

//     /**
//      * @dev Gets the current votes balance for `account`
//      */
//     function getVotes(address account) public view returns (uint256) {
//         uint256 pos = _checkpoints[account].length;
//         return pos == 0 ? 0 : _checkpoints[account][pos - 1].votes;
//     }

//     /**
//      * @dev Retrieve the number of votes for `account` at the end of `blockNumber`.
//      *
//      * Requirements:
//      *
//      * - `blockNumber` must have been already mined
//      */
//     function getPastVotes(address account, uint256 blockNumber)
//         public
//         view
//         returns (uint256)
//     {
//         require(blockNumber < block.number, "ERC20Votes: block not yet mined");
//         return _checkpointsLookup(_checkpoints[account], blockNumber);
//     }

//     /**
//      * @dev Retrieve the `totalSupply` at the end of `blockNumber`. Note, this value is the sum of all balances.
//      * It is but NOT the sum of all the delegated votes!
//      *
//      * Requirements:
//      *
//      * - `blockNumber` must have been already mined
//      */
//     function getPastTotalSupply(uint256 blockNumber)
//         public
//         view
//         returns (uint256)
//     {
//         require(blockNumber < block.number, "ERC20Votes: block not yet mined");
//         return _checkpointsLookup(_totalSupplyCheckpoints, blockNumber);
//     }

//     /**
//      * @dev Lookup a value in a list of (sorted) checkpoints.
//      */
//     function _checkpointsLookup(Checkpoint[] storage ckpts, uint256 blockNumber)
//         private
//         view
//         returns (uint256)
//     {
//         uint256 high = ckpts.length;
//         uint256 low = 0;
//         while (low < high) {
//             uint256 mid = Math.average(low, high);
//             if (ckpts[mid].fromBlock > blockNumber) {
//                 high = mid;
//             } else {
//                 low = mid + 1;
//             }
//         }

//         return high == 0 ? 0 : ckpts[high - 1].votes;
//     }

//     /**
//      * @dev Delegate votes from the sender to `delegatee`.
//      */
//     function delegate(address delegatee) public virtual {
//         return _delegate(msg.sender, delegatee);
//     }

//     /**
//      * @dev Delegates votes from signer to `delegatee`
//      */
//     function delegateBySig(
//         address delegatee,
//         uint256 nonce,
//         uint256 expiry,
//         uint8 v,
//         bytes32 r,
//         bytes32 s
//     ) public {
//         require(block.timestamp <= expiry, "ERC20Votes: signature expired");
//         bytes32 domainSeparator = keccak256(
//             abi.encode(
//                 DOMAIN_TYPEHASH,
//                 keccak256(bytes(name)),
//                 getChainId(),
//                 address(this)
//             )
//         );
//         bytes32 structHash = keccak256(
//             abi.encode(DELEGATION_TYPEHASH, delegatee, nonce, expiry)
//         );
//         bytes32 digest = keccak256(
//             abi.encodePacked("\x19\x01", domainSeparator, structHash)
//         );
//         address signer = ecrecover(digest, v, r, s);
//         require(nonce == _useNonce(signer), "ERC20Votes: invalid nonce");
//         return _delegate(signer, delegatee);
//     }

//     /**
//      * @dev Move voting power when tokens are transferred.
//      */
//     function _afterTokenTransfer(
//         address from,
//         address to,
//         uint256 amount
//     ) internal virtual {
//         _moveVotingPower(delegates(from), delegates(to), amount);
//     }

//     function _useNonce(address account) internal returns (uint256 current) {
//         Counters.Counter storage nonce = _nonces[account];
//         current = nonce.current();
//         nonce.increment();
//     }

//     /**
//      * @dev Change delegation for `delegator` to `delegatee`.
//      */
//     function _delegate(address delegator, address delegatee) internal virtual {
//         address currentDelegate = delegates(delegator);
//         uint256 delegatorBalance = balanceOf(delegator);
//         _delegates[delegator] = delegatee;

//         emit DelegateChanged(delegator, currentDelegate, delegatee);

//         _moveVotingPower(currentDelegate, delegatee, delegatorBalance);
//     }

//     function _moveVotingPower(
//         address src,
//         address dst,
//         uint256 amount
//     ) private {
//         if (src != dst && amount > 0) {
//             if (src != address(0)) {
//                 (uint256 oldWeight, uint256 newWeight) = _writeCheckpoint(
//                     _checkpoints[src],
//                     _subtract,
//                     amount
//                 );
//                 emit DelegateVotesChanged(src, oldWeight, newWeight);
//             }

//             if (dst != address(0)) {
//                 (uint256 oldWeight, uint256 newWeight) = _writeCheckpoint(
//                     _checkpoints[dst],
//                     _add,
//                     amount
//                 );
//                 emit DelegateVotesChanged(dst, oldWeight, newWeight);
//             }
//         }
//     }

//     function _writeCheckpoint(
//         Checkpoint[] storage ckpts,
//         function(uint256, uint256) view returns (uint256) op,
//         uint256 delta
//     ) private returns (uint256 oldWeight, uint256 newWeight) {
//         uint256 pos = ckpts.length;
//         oldWeight = pos == 0 ? 0 : ckpts[pos - 1].votes;
//         newWeight = op(oldWeight, delta);

//         if (pos > 0 && ckpts[pos - 1].fromBlock == block.number) {
//             ckpts[pos - 1].votes = SafeCast.toUint224(newWeight);
//         } else {
//             ckpts.push(
//                 Checkpoint({
//                     fromBlock: SafeCast.toUint32(block.number),
//                     votes: SafeCast.toUint224(newWeight)
//                 })
//             );
//         }
//     }

//     function _add(uint256 a, uint256 b) private pure returns (uint256) {
//         return a + b;
//     }

//     function _subtract(uint256 a, uint256 b) private pure returns (uint256) {
//         return a - b;
//     }

//     function getChainId() internal view returns (uint256) {
//         uint256 chainId;
//         assembly {
//             chainId := chainid()
//         }
//         return chainId;
//     }
// }
