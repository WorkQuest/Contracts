const { expect } = require('chai')
const { ethers, web3 } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')
const {
    time,
    loadFixture,
} = require('@nomicfoundation/hardhat-network-helpers')
const BigNumber = require('bignumber.js')
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs')

const toWei = (value) => ethers.utils.parseUnits(value, 18)
const toBN = (num) => {
    if (typeof num == 'string') return new BigNumber(num)
    return new BigNumber(num.toString())
}

const day = 24 * 60 * 60 // 1 day
const rewardTotal = toWei('100000')
const DISTRIBUTIONS_TIME = 2592000 // 30 * 24 * 60 * 60 // 2592000 == 30days
const twoK = toWei('2000')
const tenK = toWei('10000')

let wqt_stablecoin
let liquidity_mining
let uniV2
let owner, staker1, staker2, staker3

describe('Liquidity Mining', function () {
    async function deployWithFixture() {
        ;[owner, staker1, staker2, staker3] = await ethers.getSigners()
        const time_now = (await ethers.provider.getBlock()).timestamp
        const START_TIME = time_now + day * 3

        // ========================================= wusd stablecoin ===============================================

        const BridgeToken = await ethers.getContractFactory('WQBridgeToken')
        wqt_stablecoin = await upgrades.deployProxy(
            BridgeToken,
            ['WUSD stablecoin', 'WUSD', 18],
            { kind: 'transparent' }
        )

        await wqt_stablecoin.deployed()
        await wqt_stablecoin.grantRole(
            await wqt_stablecoin.MINTER_ROLE(),
            owner.address
        )

        // ========================================= UNI V2 ========================================================

        const UNIV2 = await ethers.getContractFactory('WQBridgeToken')
        uniV2 = await upgrades.deployProxy(UNIV2, ['UNI-V2', 'UNIv2', 18], {
            kind: 'transparent',
        })

        await uniV2.deployed()
        await uniV2.grantRole(await wqt_stablecoin.MINTER_ROLE(), owner.address)

        // ========================================= liquidity Mining ===============================================

        const LiquidityMining = await ethers.getContractFactory(
            'WQLiquidityMining'
        )
        liquidity_mining = await upgrades.deployProxy(
            LiquidityMining,
            [
                START_TIME,
                rewardTotal,
                DISTRIBUTIONS_TIME,
                wqt_stablecoin.address,
                uniV2.address,
            ],
            { kind: 'transparent' }
        )

        await liquidity_mining.deployed()
        await liquidity_mining.grantRole(
            await liquidity_mining.ADMIN_ROLE(),
            owner.address
        )

        await wqt_stablecoin.mint(liquidity_mining.address, tenK)

        // ========================================================================================

        await uniV2.mint(staker1.address, twoK)
        await uniV2.mint(staker2.address, twoK)
        await uniV2.mint(staker3.address, twoK)
        await uniV2.mint(owner.address, tenK)

        return {
            time_now,
            START_TIME,
            owner,
            staker1,
            staker2,
            wqt_stablecoin,
            uniV2,
            liquidity_mining,
        }
    }

    describe('Stake Token', function () {
        it('should be set all variables', async function () {
            const {
                time_now,
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const admin_role = await wqt_stablecoin.ADMIN_ROLE()
            const minter_role = await wqt_stablecoin.MINTER_ROLE()
            const admin_role_LM = await liquidity_mining.ADMIN_ROLE()
            expect(
                await wqt_stablecoin.hasRole(admin_role, owner.address)
            ).to.eq(true)
            expect(
                await wqt_stablecoin.hasRole(minter_role, owner.address)
            ).to.eq(true)
            expect(
                await liquidity_mining.hasRole(admin_role_LM, owner.address)
            ).to.eq(true)

            const startStaking = await liquidity_mining.startTime()
            expect(startStaking.toString()).to.eq(START_TIME.toString())
            const distTime = await liquidity_mining.distributionTime()
            expect(distTime.toString()).to.eq(DISTRIBUTIONS_TIME.toString())
        })

        it('stake LP token when timestamp is less than Start Time', async function () {
            const {
                time_now,
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const amount = toWei('100')
            const boolStatus = await liquidity_mining.stakingPaused()
            expect(boolStatus).to.eq(false)

            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)

            const balanceStaker1 = await uniV2.balanceOf(staker1.address)
            expect(balanceStaker1.toString()).to.eq(twoK.toString())
            const balanceStaker2 = await uniV2.balanceOf(staker2.address)
            expect(balanceStaker2.toString()).to.eq(twoK.toString())

            await expect(
                liquidity_mining.connect(staker1).stake(amount)
            ).to.be.revertedWith(
                'WQLiquidityMining: Staking time has not come yet'
            )
        })

        it('should be able to stake LP token: success', async function () {
            const {
                time_now,
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const _tps = toWei('10')
            const amount = toWei('100')
            await liquidity_mining.updateTps(_tps)

            const boolStatus = await liquidity_mining.stakingPaused()
            expect(boolStatus).to.eq(false)

            await time.increaseTo(START_TIME + 1)

            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)
            await liquidity_mining.connect(staker1).stake(amount)
        })

        it('check Stakers info: success', async function () {
            const {
                time_now,
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const _tps = toWei('10')
            const amount = toWei('100')
            await liquidity_mining.updateTps(_tps)

            const boolStatus = await liquidity_mining.stakingPaused()
            expect(boolStatus).to.eq(false)

            await time.increaseTo(START_TIME + 1)

            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)
            const tx_stake = await liquidity_mining
                .connect(staker1)
                .stake(amount)

            const rewardDebtInfo = toBN(amount).multipliedBy(toBN(_tps)) / 1e20
            const stakerReward = await liquidity_mining
                .connect(staker1)
                .stakes(staker1.address)
            expect(rewardDebtInfo.toString()).to.eq(
                stakerReward.rewardDebt.toString()
            )
            expect(amount.toString()).to.eq(stakerReward.amount.toString())

            const balanceAfter = await uniV2.balanceOf(liquidity_mining.address)
            expect(balanceAfter.toString()).to.eq(amount)

            await expect(tx_stake)
                .to.emit(liquidity_mining, 'Staked')
                .withArgs(amount, anyValue, staker1.address)
        })

        it('check StakeInfo: success', async function () {
            const {
                time_now,
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const _tps = toWei('10')
            const amount = toWei('100')
            await liquidity_mining.updateTps(_tps)

            const boolStatus = await liquidity_mining.stakingPaused()
            expect(boolStatus).to.eq(false)

            await time.increaseTo(START_TIME + 1)

            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)
            const tx_stake = await liquidity_mining
                .connect(staker1)
                .stake(amount)

            const rewardDebtInfo = toBN(amount).multipliedBy(toBN(_tps)) / 1e20
            const stakerReward = await liquidity_mining
                .connect(staker1)
                .stakes(staker1.address)
            expect(rewardDebtInfo.toString()).to.eq(
                stakerReward.rewardDebt.toString()
            )
            expect(amount.toString()).to.eq(stakerReward.amount.toString())

            const balanceAfter = await uniV2.balanceOf(liquidity_mining.address)
            expect(balanceAfter.toString()).to.eq(amount)

            await expect(tx_stake)
                .to.emit(liquidity_mining, 'Staked')
                .withArgs(amount, anyValue, staker1.address)

            const stakeInfo = await liquidity_mining.getStakingInfo()
            expect(stakeInfo.startTime.toString()).to.eq(START_TIME.toString())
            expect(stakeInfo.rewardTotal.toString()).to.eq(
                rewardTotal.toString()
            )
            expect(stakeInfo.totalStaked.toString()).to.eq(amount.toString())
            expect(stakeInfo.stakeTokenAddress.toString()).to.eq(
                uniV2.address.toString()
            )
            expect(stakeInfo.rewardTokenAddress.toString()).to.eq(
                wqt_stablecoin.address.toString()
            )
        })

        it('increase token staking: success', async function () {
            const {
                time_now,
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const _tps = toWei('10')
            const amount1 = toWei('100')
            const amount2 = toWei('100')
            await liquidity_mining.updateTps(_tps)

            const boolStatus = await liquidity_mining.stakingPaused()
            expect(boolStatus).to.eq(false)
            const totalStaked = await liquidity_mining.totalStaked()
            expect(totalStaked.toString()).to.eq('0')

            await time.increaseTo(START_TIME + 1)

            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount1)
            const tx_stake1 = await liquidity_mining
                .connect(staker1)
                .stake(amount1)

            await uniV2
                .connect(staker2)
                .approve(liquidity_mining.address, amount2)
            const tx_stake2 = await liquidity_mining
                .connect(staker2)
                .stake(amount2)

            const balanceAfter = await uniV2.balanceOf(liquidity_mining.address)
            const amountUniV2After = toBN(amount1)
                .plus(toBN(amount2))
                .toString()
            expect(balanceAfter.toString()).to.eq(amountUniV2After)

            const rewardTotal = await liquidity_mining.rewardTotal()
            const rewardProduced = await liquidity_mining.rewardProduced()

            const staker1After = await liquidity_mining.stakes(staker2.address)
            expect(staker1After.rewardDebt).to.eq(
                toBN(_tps).plus(toBN(rewardProduced)).toString()
            )
            const staker2After = await liquidity_mining.stakes(staker2.address)
            expect(staker2After.rewardDebt).to.eq(
                toBN(_tps).plus(toBN(rewardProduced)).toString()
            )

            await expect(tx_stake1)
                .to.emit(liquidity_mining, 'Staked')
                .withArgs(amount1, anyValue, staker1.address)

            await expect(tx_stake2)
                .to.emit(liquidity_mining, 'Staked')
                .withArgs(amount2, anyValue, staker2.address)

            const stakeInfo = await liquidity_mining.getStakingInfo()
            expect(stakeInfo.startTime.toString()).to.eq(START_TIME.toString())
            expect(stakeInfo.rewardTotal.toString()).to.eq(
                rewardTotal.toString()
            )
            expect(stakeInfo.totalStaked.toString()).to.eq(amountUniV2After)
            expect(stakeInfo.stakeTokenAddress.toString()).to.eq(
                uniV2.address.toString()
            )
            expect(stakeInfo.rewardTokenAddress.toString()).to.eq(
                wqt_stablecoin.address.toString()
            )
        })

        it('should change the contract balance: success', async function () {
            const {
                time_now,
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const _tps = toWei('10')
            await time.increaseTo(START_TIME + 1)
            const amount = toWei('1000')
            await liquidity_mining.updateTps(_tps)

            const tokensPerStakeBefore = await liquidity_mining.tokensPerStake()
            expect(tokensPerStakeBefore.toString()).to.eq(_tps)
            const totalStaked = await liquidity_mining.totalStaked()
            expect(totalStaked.toString()).to.eq('0')

            // ================================== staker1 =============================
            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)
            await liquidity_mining.connect(staker1).stake(amount)

            const rewardDebtInfo = toBN(amount).multipliedBy(toBN(_tps)) / 1e20
            const sraker1 = await liquidity_mining.stakes(staker1.address)
            expect(sraker1.rewardDebt.toString()).to.eq(
                rewardDebtInfo.toString()
            )

            // ================================== staker2 =============================

            const totalStakedAfter = await liquidity_mining.totalStaked()
            expect(totalStakedAfter.toString()).to.eq(amount)

            await uniV2
                .connect(staker2)
                .approve(liquidity_mining.address, amount)
            await liquidity_mining.connect(staker2).stake(amount)

            const staker2After = await liquidity_mining.stakes(staker2.address)

            const tokensPerStakeBefore2 =
                await liquidity_mining.tokensPerStake()
            const reward = toBN(staker2After.amount)
                .multipliedBy(toBN(tokensPerStakeBefore2))
                .div(toBN(1e20))
                .plus(toBN(staker2After.rewardAllowed))
                .minus(toBN(staker2After.distributed))
                .minus(toBN(staker2After.rewardDebt))
            expect(reward.toString()).to.eq('0')
            const balanceContract = await uniV2.balanceOf(
                liquidity_mining.address
            )
            expect(balanceContract.toString()).to.eq(
                toBN(amount).plus(toBN(amount)).toString()
            )
        })

        it('check Update(): success', async function () {
            const {
                time_now,
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const _tps = toWei('10')
            const amount = toWei('1000')
            await liquidity_mining.updateTps(_tps)

            const tokensPerStakeBefore = await liquidity_mining.tokensPerStake()
            expect(tokensPerStakeBefore.toString()).to.eq(_tps)
            await time.increaseTo(START_TIME + 1)

            const totalStaked = await liquidity_mining.totalStaked()
            expect(totalStaked.toString()).to.eq('0')

            // ============================== owner stakes 10K =============================

            await uniV2.connect(owner).approve(liquidity_mining.address, tenK)
            const tx_owner = await liquidity_mining.connect(owner).stake(tenK)
            const ts = await getTimestamp(tx_owner.blockNumber)

            const ownerInfo = await liquidity_mining.stakes(owner.address)
            const rewardDebtOwner = toBN(tenK).multipliedBy(toBN(_tps)) / 1e20
            expect(toBN(ownerInfo.rewardDebt).toString()).to.eq(
                toBN(rewardDebtOwner).toString()
            )

            await expect(tx_owner)
                .to.emit(liquidity_mining, 'Staked')
                .withArgs(tenK, ts, owner.address)

            // ============================== staker1 =============================

            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)
            const tx_staker1 = await liquidity_mining
                .connect(staker1)
                .stake(amount)

            const tokensPerStake = await liquidity_mining.tokensPerStake() // 13859567901234567901
            const stakerRewardDebt = toBN(amount)
                .multipliedBy(toBN(tokensPerStake))
                .div(toBN(1e20))

            const staker1Info = await liquidity_mining.stakes(staker1.address)
            expect(staker1Info.rewardDebt.toString()).to.eq(
                stakerRewardDebt.toString()
            )
            expect(staker1Info.amount).to.eq(amount)

            const totalStakedAfter = await liquidity_mining.totalStaked()
            expect(totalStakedAfter.toString()).to.eq(
                toBN(tenK).plus(toBN(amount)).toString()
            )

            const timeStampStaker1 = await getTimestamp(tx_staker1.blockNumber)

            await expect(tx_staker1)
                .to.emit(liquidity_mining, 'Staked')
                .withArgs(amount, timeStampStaker1, staker1.address)

            // ============================== staker2 =============================

            const allProduced = await liquidity_mining.allProduced()
            const rewardTotal = await liquidity_mining.rewardTotal()
            const timeStamp = await time.latest()

            const rewardProducedAtNow = toBN(allProduced)
                .plus(
                    toBN(rewardTotal).multipliedBy(
                        toBN(timeStamp).minus(toBN(START_TIME))
                    )
                )
                .div(toBN(DISTRIBUTIONS_TIME))

            const rewardProduced = await liquidity_mining.rewardProduced() // 385,995370370370370369
            const producedNew = toBN(rewardProducedAtNow).minus(
                toBN(rewardProduced)
            )

            const newtokensPerStake = toBN(tokensPerStake).plus(
                toBN(producedNew)
                    .multipliedBy(toBN(1e20))
                    .div(toBN(totalStakedAfter))
            )

            // ===================================================================

            await uniV2
                .connect(staker2)
                .approve(liquidity_mining.address, amount)
            const tx_staker2 = await liquidity_mining
                .connect(staker2)
                .stake(amount)
            const timeStampStaker2 = await getTimestamp(tx_staker2.blockNumber)
            const staker2Info = await liquidity_mining.stakes(staker2.address)

            // update + produced()
            const allProducedStaker2 = await liquidity_mining.allProduced()
            const rewardTotalStaker2 = await liquidity_mining.rewardTotal()
            const rewardProducedAtNow2 = toBN(allProducedStaker2)
                .plus(
                    toBN(rewardTotalStaker2).multipliedBy(
                        toBN(timeStampStaker2).minus(toBN(START_TIME))
                    )
                )
                .div(toBN(DISTRIBUTIONS_TIME))

            const rewardProduced2 = await liquidity_mining.rewardProduced()
            const producedNew2 = toBN(rewardProducedAtNow2).minus(
                toBN(rewardProduced2)
            )
            const newTokensPerStake2 = toBN(tokensPerStake).plus(
                toBN(producedNew2)
                    .multipliedBy(toBN(1e20))
                    .div(toBN(totalStakedAfter))
            )
            expect(newTokensPerStake2.dp(1).toFixed().toString()).to.eq(
                tokensPerStake.toString()
            )

            const tokensPerStakeSum = await liquidity_mining.tokensPerStake()
            const staker2RewardDebt = toBN(amount)
                .multipliedBy(toBN(tokensPerStakeSum))
                .div(toBN(1e20))
            expect(staker2Info.rewardDebt.toString()).to.eq(
                staker2RewardDebt.toString()
            )

            const totalStakedAfterStaker2 = await liquidity_mining.totalStaked()
            expect(totalStakedAfterStaker2.toString()).to.eq(
                toBN(tenK)
                    .plus(toBN(amount).plus(toBN(amount)))
                    .toString()
            )
            await expect(tx_staker2)
                .to.emit(liquidity_mining, 'Staked')
                .withArgs(amount, timeStampStaker2, staker2.address)
        })

        it('should increase rewardProduced(): success', async function () {
            const {
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const amount = toWei('1000')
            await time.increaseTo(START_TIME + 1)

            // ================================= owner =================================

            await uniV2.connect(owner).approve(liquidity_mining.address, tenK)
            await liquidity_mining.connect(owner).stake(tenK)

            const totalStaker_afterOwner = await liquidity_mining.totalStaked()
            expect(totalStaker_afterOwner.toString()).to.eq(tenK.toString())

            // ================================ staker1 ================================

            await network.provider.send('evm_increaseTime', [day])
            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)
            const tx_staker1 = await liquidity_mining
                .connect(staker1)
                .stake(amount)

            const allProduced_afterStaker1 =
                await liquidity_mining.allProduced()
            const rewardTotal = await liquidity_mining.rewardTotal()
            const latestTimeStaker1 = await getTimestamp(tx_staker1.blockNumber)

            const rewardProducedAtNowByOwner = toBN(allProduced_afterStaker1)
                .plus(
                    toBN(rewardTotal).multipliedBy(
                        toBN(latestTimeStaker1).minus(toBN(START_TIME))
                    )
                )
                .div(toBN(DISTRIBUTIONS_TIME))

            const rewardProduced_afterStaker1 =
                await liquidity_mining.rewardProduced()
            expect(
                toBN(rewardProducedAtNowByOwner).toExponential(20).toString()
            ).to.eq(
                toBN(rewardProduced_afterStaker1).toExponential(20).toString()
            )
        })

        it('should calculate tokensPerStake: success', async function () {
            const {
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const amount = toWei('1000')
            await time.increaseTo(START_TIME + 1)

            await uniV2.connect(owner).approve(liquidity_mining.address, tenK)
            await liquidity_mining.connect(owner).stake(tenK)

            // ================================ staker1 ================================

            const tokensPerStake = await liquidity_mining.tokensPerStake()
            const rewardProduced = await liquidity_mining.rewardProduced()
            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)
            const tx_staker1 = await liquidity_mining
                .connect(staker1)
                .stake(amount)

            const allProduced = await liquidity_mining.allProduced()
            const rewardTotal = await liquidity_mining.rewardTotal()
            const timeStamp = await getTimestamp(tx_staker1.blockNumber)
            const producedTime = START_TIME
            const distributionTime = DISTRIBUTIONS_TIME

            const rewardProducedAtNow = toBN(allProduced)
                .plus(
                    toBN(rewardTotal).multipliedBy(
                        toBN(timeStamp).minus(toBN(producedTime))
                    )
                )
                .div(toBN(distributionTime))

            const producedNew = toBN(rewardProducedAtNow).minus(
                toBN(rewardProduced)
            )

            const UPDtokensPerStake = toBN(tokensPerStake)
                .plus(toBN(producedNew).multipliedBy(toBN(1e20)))
                .div(toBN(tenK))

            const tokensPerStakeAfter = await liquidity_mining.tokensPerStake()
            expect(tokensPerStakeAfter.toString()).to.eq(
                UPDtokensPerStake.dp(0).toFixed().toString()
            )

            const tokensPerStake_New = UPDtokensPerStake.dp(0)
                .toFixed()
                .toString()

            // ============================== staker2 ==============================

            const rewardProduced_staker2 =
                await liquidity_mining.rewardProduced()
            const totalStaked_2 = await liquidity_mining.totalStaked()

            await uniV2
                .connect(staker2)
                .approve(liquidity_mining.address, amount)
            const tx_staker2 = await liquidity_mining
                .connect(staker2)
                .stake(amount)

            const allProduced_staker2 = await liquidity_mining.allProduced()
            const rewardTotal_staker2 = await liquidity_mining.rewardTotal()
            const timeStamp_staker2 = await getTimestamp(tx_staker2.blockNumber)
            const producedTime_staker2 = START_TIME
            const distributionTime_staker2 = DISTRIBUTIONS_TIME

            const rewardProducedAtNow_staker2 = toBN(allProduced_staker2)
                .plus(
                    toBN(rewardTotal_staker2).multipliedBy(
                        toBN(timeStamp_staker2).minus(
                            toBN(producedTime_staker2)
                        )
                    )
                )
                .div(toBN(distributionTime_staker2))

            const producedNew_2 = toBN(rewardProducedAtNow_staker2).minus(
                toBN(rewardProduced_staker2)
            )

            const tokensPerStake_New2 = toBN(tokensPerStake_New)
                .plus(toBN(producedNew_2).multipliedBy(toBN(1e20)))
                .div(toBN(totalStaked_2))

            const tokensPerStakeAfter_staker2 =
                await liquidity_mining.tokensPerStake()

            const tokensPerStakeAfter_staker_calc = toBN(
                tokensPerStake_New2
            ).plus(toBN(tokensPerStake_New))

            expect(tokensPerStakeAfter_staker2.toString()).to.eq(
                tokensPerStakeAfter_staker_calc.dp(0).toFixed().toString()
            )
        })

        it('should calculate rewardDebt: success', async function () {
            const {
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const _tps = toWei('10')
            const amount = toWei('100')
            await liquidity_mining.updateTps(_tps)

            const boolStatus = await liquidity_mining.stakingPaused()
            expect(boolStatus).to.eq(false)

            await time.increaseTo(START_TIME + 1)

            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)
            const tx_stake = await liquidity_mining
                .connect(staker1)
                .stake(amount)

            const rewardDebtInfo = toBN(amount).multipliedBy(toBN(_tps)) / 1e20
            const stakerReward = await liquidity_mining
                .connect(staker1)
                .stakes(staker1.address)
            expect(rewardDebtInfo.toString()).to.eq(
                stakerReward.rewardDebt.toString()
            )
            expect(amount.toString()).to.eq(stakerReward.amount.toString())

            const balanceAfter = await uniV2.balanceOf(liquidity_mining.address)
            expect(balanceAfter.toString()).to.eq(amount)

            await expect(tx_stake)
                .to.emit(liquidity_mining, 'Staked')
                .withArgs(amount, anyValue, staker1.address)
        })
    })

    describe('Claim Tokens', function () {
        it('should calculate getClaim()', async function () {
            const {
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const amount = toWei('1000')
            await time.increaseTo(START_TIME + 1)

            await uniV2.connect(owner).approve(liquidity_mining.address, tenK)
            await liquidity_mining.connect(owner).stake(tenK)

            await network.provider.send('evm_increaseTime', [10800])
            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)
            const tx_staker1 = await liquidity_mining
                .connect(staker1)
                .stake(amount)

            await network.provider.send('evm_increaseTime', [10800])

            await uniV2
                .connect(staker2)
                .approve(liquidity_mining.address, amount)
            const tx_staker2 = await liquidity_mining
                .connect(staker2)
                .stake(amount)

            await network.provider.send('evm_increaseTime', [10800])

            const totalStakedAmount = toBN(tenK).plus(
                toBN(amount).multipliedBy(toBN(2))
            )
            const stakeInfo = await liquidity_mining.getStakingInfo()
            expect(stakeInfo.startTime).to.eq(START_TIME)
            expect(stakeInfo.rewardTotal).to.eq(rewardTotal)
            expect(stakeInfo.distributionTime).to.eq(DISTRIBUTIONS_TIME)
            expect(stakeInfo.totalStaked.toString()).to.eq(
                totalStakedAmount.toString()
            )
            expect(stakeInfo.totalDistributed.toString()).to.eq('0')
            expect(stakeInfo.stakeTokenAddress.toString()).to.eq(uniV2.address)
            expect(stakeInfo.rewardTokenAddress.toString()).to.eq(
                wqt_stablecoin.address
            )

            // =========================== getClaim =============================

            const tps = await liquidity_mining.tokensPerStake()
            const rewardProduced = await liquidity_mining.rewardProduced()
            const allProduced = await liquidity_mining.allProduced()
            const timeStamp = await time.latest()
            const totalStaked = await liquidity_mining.totalStaked()

            const rewardProducedAtNow = toBN(allProduced)
                .plus(
                    toBN(rewardTotal).multipliedBy(
                        toBN(timeStamp).minus(toBN(START_TIME))
                    )
                )
                .div(toBN(DISTRIBUTIONS_TIME))

            const producedNew = toBN(rewardProducedAtNow).minus(
                toBN(rewardProduced)
            )

            const _tps = toBN(tps)
                .plus(toBN(producedNew).multipliedBy(toBN(1e20)))
                .div(toBN(totalStaked))

            // ========================== calcReward =============================

            const stakerInfo = await liquidity_mining.stakes(staker1.address)
            const staker1Amount = stakerInfo.amount
            const staker1RewardAllowed = stakerInfo.rewardAllowed
            const staker1Distributed = stakerInfo.distributed
            const staker1rewardDebt = stakerInfo.rewardDebt

            const reward = toBN(staker1Amount)
                .multipliedBy(toBN(tps))
                .div(toBN(1e20))
                .plus(toBN(staker1RewardAllowed))
                .minus(toBN(staker1Distributed))
                .minus(toBN(staker1rewardDebt))

            const getClaimReward = await liquidity_mining.getClaim(
                staker1.address
            )
            expect(getClaimReward.toString()).to.eq(reward.toString())
        })

        it('should calculate claim()', async function () {
            const {
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const amount = toWei('1000')
            await time.increaseTo(START_TIME + 1)

            await uniV2.connect(owner).approve(liquidity_mining.address, tenK)
            await liquidity_mining.connect(owner).stake(tenK)

            await network.provider.send('evm_increaseTime', [10800])
            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)
            await liquidity_mining.connect(staker1).stake(amount)

            await network.provider.send('evm_increaseTime', [10800])

            await uniV2.connect(staker2).approve(liquidity_mining.address, twoK)
            await liquidity_mining.connect(staker2).stake(twoK)

            await network.provider.send('evm_increaseTime', [32400])

            const totalStakedAmount = toBN(tenK).plus(
                toBN(amount).plus(toBN(twoK))
            )
            const stakeInfo = await liquidity_mining.getStakingInfo()
            expect(stakeInfo.startTime).to.eq(START_TIME)
            expect(stakeInfo.rewardTotal).to.eq(rewardTotal)
            expect(stakeInfo.distributionTime).to.eq(DISTRIBUTIONS_TIME)
            expect(stakeInfo.totalStaked.toString()).to.eq(
                totalStakedAmount.toString()
            )
            expect(stakeInfo.totalDistributed.toString()).to.eq('0')
            expect(stakeInfo.stakeTokenAddress.toString()).to.eq(uniV2.address)
            expect(stakeInfo.rewardTokenAddress.toString()).to.eq(
                wqt_stablecoin.address
            )

            // =========================== claim ================================

            await network.provider.send('evm_increaseTime', [10800])

            const rewardProduced = await liquidity_mining.rewardProduced()

            const allProduced = await liquidity_mining.allProduced()
            const timeStamp = await time.latest()
            const producedTime_tx = await liquidity_mining.producedTime()
            const totalStaked = await liquidity_mining.totalStaked()
            const tokensPerStake = await liquidity_mining.tokensPerStake()
            const distributionTime = await liquidity_mining.distributionTime()

            const rewardProducedAtNow = toBN(allProduced)
                .plus(
                    toBN(rewardTotal).multipliedBy(
                        toBN(timeStamp).minus(toBN(producedTime_tx))
                    )
                )
                .div(toBN(distributionTime))

            const producedNew = toBN(rewardProducedAtNow).minus(
                toBN(rewardProduced)
            )

            const tokensPerStake_new = toBN(tokensPerStake)
                .plus(toBN(producedNew).multipliedBy(toBN(1e20)))
                .div(toBN(totalStaked))

            const rewardProducedAtNow_After = rewardProducedAtNow

            // ========================== calcReward =============================

            const stakerInfo = await liquidity_mining.stakes(staker1.address)
            const staker1Amount = stakerInfo.amount
            const staker1RewardAllowed = stakerInfo.rewardAllowed
            const staker1Distributed = stakerInfo.distributed
            const staker1rewardDebt = stakerInfo.rewardDebt

            const reward = toBN(staker1Amount)
                .multipliedBy(toBN(tokensPerStake))
                .div(toBN(1e20))
                .plus(toBN(staker1RewardAllowed))
                .minus(toBN(staker1Distributed))
                .minus(toBN(staker1rewardDebt))

            const getClaimReward = await liquidity_mining.getClaim(
                staker1.address
            )
            expect(getClaimReward.toString()).to.eq(reward.toString())

            // ================================== claim ===================================================

            const balanceClaimBefore = await wqt_stablecoin.balanceOf(
                staker1.address
            )
            expect(balanceClaimBefore).to.eq('0')
            await liquidity_mining.connect(staker1).claim()
            const staker1InfoAfterClaim = await liquidity_mining
                .connect(staker1)
                .stakes(staker1.address)

            const balanceClaimAfter = await wqt_stablecoin.balanceOf(
                staker1.address
            )
            expect(balanceClaimAfter).to.eq(
                staker1InfoAfterClaim.distributed.toString()
            )
        })

        it('should able to unstake()', async function () {
            const {
                START_TIME,
                owner,
                staker1,
                staker2,
                wqt_stablecoin,
                uniV2,
                liquidity_mining,
            } = await loadFixture(deployWithFixture)

            const amount = toWei('1000')
            await time.increaseTo(START_TIME + 1)

            await uniV2.connect(owner).approve(liquidity_mining.address, tenK)
            await liquidity_mining.connect(owner).stake(tenK)

            await network.provider.send('evm_increaseTime', [10800])
            await uniV2
                .connect(staker1)
                .approve(liquidity_mining.address, amount)
            await liquidity_mining.connect(staker1).stake(amount)

            await network.provider.send('evm_increaseTime', [10800])

            await uniV2.connect(staker2).approve(liquidity_mining.address, twoK)
            await liquidity_mining.connect(staker2).stake(twoK)

            await network.provider.send('evm_increaseTime', [32400])

            const totalStakedAmount = toBN(tenK).plus(
                toBN(amount).plus(toBN(twoK))
            )
            const stakeInfo = await liquidity_mining.getStakingInfo()
            expect(stakeInfo.startTime).to.eq(START_TIME)
            expect(stakeInfo.rewardTotal).to.eq(rewardTotal)
            expect(stakeInfo.distributionTime).to.eq(DISTRIBUTIONS_TIME)
            expect(stakeInfo.totalStaked.toString()).to.eq(
                totalStakedAmount.toString()
            )
            expect(stakeInfo.totalDistributed.toString()).to.eq('0')
            expect(stakeInfo.stakeTokenAddress.toString()).to.eq(uniV2.address)
            expect(stakeInfo.rewardTokenAddress.toString()).to.eq(
                wqt_stablecoin.address
            )

            await liquidity_mining.connect(staker1).unstake(amount)
            const stakeInfoUnstake = await liquidity_mining.stakes(
                staker1.address
            )
            expect(stakeInfoUnstake.amount).to.eq('0')

            const balanceAfter = await uniV2.balanceOf(staker1.address)
            expect(balanceAfter.toString()).to.eq(twoK.toString())
        })
    })

    async function getTimestamp(bn) {
        return (await ethers.provider.getBlock(bn)).timestamp
    }
})
