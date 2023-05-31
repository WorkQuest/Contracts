# Smart-contracts for WorkQuest project

## Install dependencies
`npm install`

## Build contracts
`npx hardhat compile`

## Deploy basic contracts
* Set MNEMONIC and PROVIDER_API_KEY in .env file

### Tokens
First of all, you need to deploy wrapped tokens: WUSD, ETH, BNB, USDT, etc.
* Set BRIDGE_TOKEN_NAME, BRIDGE_TOKEN_SYMBOL and BRIDGE_TOKEN_DECIMALS to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_wrapped_token.js --network` _yourNetwork_
* Repeat until all tokens are deployed

### Bridge
Next you should deploy the bridge
* Set CHAIN_ID (id of current network), NATIVE_COIN (symbol of native coin for this network) and BRIDGE_VALIDATOR (address of validator) to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_bridge_pool.js --network` _yourNetwork_ to deploy pool of bridge - special contract for storing tokens +
* Run `npx hardhat run scripts/deploy_bridge.js --network` _yourNetwork_ to deploy bridge +
* Run `npx hardhat add_chains_to_bridge --chain` _chainId_ `--network` _yourNetwork_ to add allowed networks for swapping +
* Run `npx hardhat add_token_to_bridge --symbol` _tokenSymbol_ `--lockable 1 --network` _yourNetwork_ to add allowed tokens for + swapping. If `locable` option is set to false then tokens will be burned and minted, else they will be transferred to pool of bridge.
* Run `npx hardhat grant_roles_for_bridge --network` _yourNetwork_ to grant minter and burner roles of tokens for bridge address-

### Price oracle
* Set PRICE_ORACLE_SERVICE (address of validator of prices) and PRICE_ORACLE_VALID_TIME to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_price_oracle.js --network` _yourNetwork_ to deploy price oracle +
* Run `npx hardhat config_price_oracle --network` _yourNetwork_ to add allowed tokens +

### Referral
This contract requires a deployed price oracle contract 
* Set REFERRAL_SERVICE, REFERRAL_REWARD (reward value in USD for each worker, that earned REFERRAL_EARNED_THRESHOLD USD), REFERRAL_EARNED_THRESHOLD to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_referral.js --network` _yourNetwork_ to deploy referral contract

### Pension fund
This contract requires a deployed WUSD token contract
* Set PENSION_LOCK_TIME, PENSION_DEFAULT_FEE, PENSION_APY, PENSION_FEE_RECEIVER, PENSION_FEE_PER_MONTH and PENSION_FEE_WITHDRAW to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_pension.js --network` _yourNetwork_ to deploy pension fund

### WorkQuest factory
This contract requires a deployed pension fund, referral and WUSD token contracts
* Set WORKQUEST_FEE_EMPLOYER (fee coefficient for employer), WORKQUEST_FEE_WORKER (fee coefficient for worker), WORKQUEST_FEE_TX (comission value to refund for arbiters) and WORKQUEST_FEE_RECEIVER to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_workquest.js --network` _yourNetwork_ to deploy quest factory

### Promotion (rise view) contract
This contract requires a deployed workquest factory and WUSD token contracts
* Set PROMOTION_FEE_RECEIVER to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_promotion.js --network` _yourNetwork_ to deploy promotion contract

### Lending
This contract requires a deployed WUSD token contracts
* Set LENDING_FEE_RECEIVER and LENDING_FEE to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_lending.js --network` _yourNetwork_ to deploy lending contract

### Saving product
This contract requires a deployed WUSD token contracts
* Set SAVING_PRODUCT_FEE_RECEIVER, SAVING_PRODUCT_FEE_PER_MONTH and SAVING_PRODUCT_FEE_WITHDRAW to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_saving_product.js --network` _yourNetwork_ to deploy lending contract

### Borrowing
This contract requires a deployed WUSD and collateral (ETH, BNB, etc.) tokens, price oracle, pension fund, lending and saving product contracts
* Set BORROWING_FEE_RECEIVER, BORROWING_FEE, BORROWING_AUCTION_DURATION, BORROWING_AUCTION_UPPER_BOUND_COST and BORROWING_AUCTION_LOWER_BOUND_COST to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_borrowing.js --network` _yourNetwork_ to deploy borrowing contract

### DAO voting
* Set DAO_CHAIR_PERSON, DAO_MINIMUM_QUORUM, DAO_VOTING_PERIOD, DAO_PROPOSAL_THRESHOLD, DAO_VOTE_THRESHOLD, DAO_FEE and DAO_FEE_RECEIVER to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_dao.js --network` _yourNetwork_ to deploy dao contract

### Staking WQT
* Set STAKING_NATIVE_START_TIME, STAKING_NATIVE_REWARD_TOTAL, STAKING_NATIVE_DISTRIBUTION_TIME, STAKING_NATIVE_STAKE_PERIOD, STAKING_NATIVE_CLAIM_PERIOD, STAKING_NATIVE_MIN_STAKE and STAKING_NATIVE_MAX_STAKE to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_staking_native.js --network` _yourNetwork_ to deploy staking contract

### Staking WUSD
* Set STAKING_START_TIME, STAKING_REWARD_TOTAL, STAKING_DISTRIBUTION_TIME, STAKING_STAKE_PERIOD, STAKING_CLAIM_PERIOD, STAKING_MIN_STAKE and STAKING_MAX_STAKE to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_staking.js --network` _yourNetwork_ to deploy staking contract

## Deploy stablecoin subsystem

### Router
This contract requires a deployed WUSD token and price oracle contracts
* Set ROUTER_FEE_RECEIVER to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_router.js --network` _yourNetwork_ to deploy router contract

### Collateral auctions
This contracts requires a deployed router, price oracle and collateral tokens (ETH, BNB, USDT, etc.) contracts
* Set SYMBOL_AUCTION_MIN_RATIO, SYMBOL_AUCTION_LIQUIDATE_TRESHOLD, SYMBOL_AUCTION_DURATION, SYMBOL_FEE_REWARDS, SYMBOL_FEE_PLATFORM, SYMBOL_FEE_RESERVES to .env-_yourNetwork_ file
* Run `npx hardhat run scripts/deploy_collateral_auction.js --network` _yourNetwork_ to deploy collateral auction contracts
* Run `npx hardhat config_router --network` _yourNetwork_ to config router and token credentials



### Liquidity Mining
* We have Listing on Uniswap & Pancakeswap
* Uniswap ETH/WQT
* UNIv2 for Ether
* CakeLp for Pancekeswap
** Staking formula APY динамический по формуле: Apy = (DailyReward * RewardTokenPrice)/(TotalStaked * StakeTokenPrice) * 100% 



### STAKING NFT 

This project is a generic (N)FT smart contract that allows staking of ERC721 
tokens.

## Basics

The main contract resides in [Staking.sol](contracts/Staking.sol).

## Staking

Staking NFTs is possible via several means.

### ERC721

The [ERC721 Standard](@openzeppelin/contracts/token/ERC721/ERC721.sol) has 2 methods for
transferring NFTs:

* `transferFrom`: This method does not inform the receiver that they have received an NFT and is
  therefor __not suitable__ for staking
* `safeTransferFrom`: This method performs an additional check that if the receiver is a smart
  contract, it __must__ implement the
  [IERC721Receiver](@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol) interface.
  The staking contract implements this interface.


### Mixed stake

In several scenarios users might want to stake multiple NFTs at once, and from multiple collections.
This is not possible with either of the previously described ways, so the smart contract offers a
custom `stake` method. For the method to work the user needs to approve the staking smart contract
for all collections though. This is a bit annoying in the beginning, but for Dungeon Master it's a
one time operation.

## Staking validation

It should not be possible to stake arbitrary NFTs. To ensure that a so called
[staking validator](contracts/IStakeValidator.sol) is used in the staking smart contract to
validate each staking operation.

### Signature staking validation

The currently only available option for staking validation is the
[signature staking validator](contracts/SignatureStakeValidator.sol). It uses the arbitrary
`bytes data` argument to all staking operations to expect a signature that was created in our
backend and verifies it.

The validation works as follows:

1. Extract the timestamp the signature was created for and the signature itself from the 97 bytes
   array (32 bytes for timestamp, 65 for the signature)
2. Verify the timestamp is not older than one hour
3. Recreate the hash that was signed from the staking data by keccak256 hashing the following data:
   1. ERC721 single stake: packed encode of `[time, tokenContract, tokenId]`
   2. ERC1155 single stake: packed encode of `[time, tokenContract, tokenId, amount]`
   3. ERC1155 batch stake: ABI encode of `[time, tokenContract, tokenIds, amounts]`
   4. Mixed stake: ABI encode of `[time, tokenContracts, tokenIds, amounts]`
      Here `tokenIds` and `amounts` are _nested_ arrays. For ERC721 tokens the `amount` "inner"
      array must be empty.
   From this hash and the signature the signing address is then extracted using `ecrecover` and
   verified.

Only stakes that pass validation are recorded.