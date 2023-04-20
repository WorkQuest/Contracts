const Web3 = require('web3')
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

const PaidTariff = Object.freeze({
    GoldPlus: 0,
    Gold: 1,
    Silver: 2,
    Bronze: 3,
})

const Mwei = (value) => ethers.utils.parseUnits(value, 6)
const toWei = (value) => ethers.utils.parseUnits(value, 18)
const toBN = (num) => {
    if (typeof num == 'string') return new BigNumber(num)
    return new BigNumber(num.toString())
}

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7' //USDT contract
const USDT_WAHLE = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503'
const SYMBOL = 'USDT'
const WORKQUEST_FEE = Mwei('0.01')
const PRICE = Mwei('1.01')
const VALID_TIME = 1000
const PENSION_LOCK_TIME = 60
const PENSION_DEFAULT_FEE = Mwei('0.01')
const PENSION_FEE_PER_MONTH = Mwei('0.0012')
const PENSION_FEE_WITHDRAW = Mwei('0.005')
const twentyWQT = toWei('20')
const cost_comission = Mwei('102')
const job_hash = web3.utils.keccak256('JOBHASH')
const cost = Mwei('100')
const fiftyDays = 4320000 // 50 * 24 * 60 * 60
const oneMoth = 2592000 // 30 * 24 * 60 * 60
const twoWeek = 1209600 // 14 * 24 * 60 * 60
const sevenDays = 604800 // 7 * 24 * 60 * 60 // 604800 == 7days

let deadline = '9999999999'
let work_quest_owner
let whaleUsdt
let employer, arbiter
let worker
let feeReceiver
let work_quest_factory
let work_quest
let priceOracle
let usdt
let pension_fund
let promotion
let nonce = 1

describe('Promotion USDT', function () {
    async function deployWithFixture() {
        await resetFork()
        ;[work_quest_owner, employer, worker, feeReceiver, service, arbiter] =
            await ethers.getSigners()

        const PriceOracle = await ethers.getContractFactory('WQPriceOracle')

        priceOracle = await upgrades.deployProxy(
            PriceOracle,
            [service.address, VALID_TIME],
            { kind: 'transparent' }
        )

        await priceOracle.deployed()
        await priceOracle.updateToken(1, SYMBOL)
        await oracleSetPrice(PRICE, SYMBOL)

        // ========================================================================================

        usdt = await ethers.getContractAt('IERC20Upgradeable', USDT)
        await impersonate(USDT_WAHLE)
        whaleUsdt = await ethers.getSigner(USDT_WAHLE)
        await usdt.deployed()
        await usdt.connect(whaleUsdt).transfer(employer.address, Mwei('200000'))

        // ========================================================================================

        const PensionFund = await ethers.getContractFactory('WQPensionFund')
        pension_fund = await upgrades.deployProxy(
            PensionFund,
            [
                PENSION_LOCK_TIME,
                PENSION_DEFAULT_FEE,
                usdt.address,
                feeReceiver.address,
                PENSION_FEE_PER_MONTH,
                PENSION_FEE_WITHDRAW,
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await pension_fund.deployed()

        // ========================================================================================

        const WQReferralContract = await ethers.getContractFactory('WQReferral')
        referral = await upgrades.deployProxy(
            WQReferralContract,
            [priceOracle.address, service.address, twentyWQT, Mwei('1000')],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await referral.deployed()
        await referral.grantRole(await referral.SERVICE_ROLE(), service.address)

        // ========================================================================================

        const WorkQuestFactory = await ethers.getContractFactory(
            'WorkQuestFactory'
        )
        work_quest_factory = await upgrades.deployProxy(
            WorkQuestFactory,
            [
                WORKQUEST_FEE,
                WORKQUEST_FEE,
                WORKQUEST_FEE,
                feeReceiver.address,
                pension_fund.address,
                referral.address,
                usdt.address,
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )

        await work_quest_factory.deployed()
        await referral.setFactory(work_quest_factory.address)

        await work_quest_factory.grantRole(
            await work_quest_factory.ARBITER_ROLE(),
            arbiter.address
        )

        // ========================================================================================

        const Promotion = await ethers.getContractFactory('WQPromotion')
        promotion = await await upgrades.deployProxy(
            Promotion,
            [feeReceiver.address, work_quest_factory.address, usdt.address],
            { initializer: 'initialize', kind: 'transparent' }
        )

        await promotion.grantRole(
            await referral.ADMIN_ROLE(),
            work_quest_owner.address
        )
        // ========================================================================================

        await usdt
            .connect(employer)
            .approve(work_quest_factory.address, cost_comission)
        await work_quest_factory
            .connect(employer)
            .newWorkQuest(job_hash, cost, deadline, 1)

        const work_quest_address = (
            await work_quest_factory.getWorkQuests(employer.address, 0, 1)
        )[0]

        work_quest = await ethers.getContractAt('WorkQuest', work_quest_address)
        await work_quest.deployed()

        return {
            work_quest_owner,
            employer,
            worker,
            feeReceiver,
            service,
            priceOracle,
            usdt,
            pension_fund,
            referral,
            work_quest_factory,
            work_quest,
            promotion,
        }
    }

    it('Should be able to setQuestTariff(): success', async function () {
        const { promotion } = await loadFixture(deployWithFixture)

        const goldPlus = Mwei('60')
        const gold = Mwei('40')
        const silver = Mwei('30')
        const bronze = Mwei('20')

        await promotion.setQuestTariff(0, fiftyDays, goldPlus)
        await promotion.setQuestTariff(1, oneMoth, gold)
        await promotion.setQuestTariff(2, twoWeek, silver)
        await promotion.setQuestTariff(3, sevenDays, bronze)

        const checkGoldPlus = await promotion.questTariff(
            PaidTariff.GoldPlus,
            fiftyDays
        )
        const checkGold = await promotion.questTariff(PaidTariff.Gold, oneMoth)
        const checkSilver = await promotion.questTariff(
            PaidTariff.Silver,
            twoWeek
        )
        const checkBronze = await promotion.questTariff(
            PaidTariff.Bronze,
            sevenDays
        )

        expect(checkGoldPlus).to.eq(goldPlus)
        expect(checkGold).to.eq(gold)
        expect(checkSilver).to.eq(silver)
        expect(checkBronze).to.eq(bronze)
    })

    it('Should be able to setUserTariff(): success', async function () {
        const { promotion } = await loadFixture(deployWithFixture)

        const goldPlus = Mwei('60')
        const gold = Mwei('40')
        const silver = Mwei('30')
        const bronze = Mwei('20')

        await promotion.setUserTariff(0, fiftyDays, goldPlus)
        await promotion.setUserTariff(1, oneMoth, gold)
        await promotion.setUserTariff(2, twoWeek, silver)
        await promotion.setUserTariff(3, sevenDays, bronze)

        const checkGoldPlus = await promotion.usersTariff(
            PaidTariff.GoldPlus,
            fiftyDays
        )
        const checkGold = await promotion.usersTariff(PaidTariff.Gold, oneMoth)
        const checkSilver = await promotion.usersTariff(
            PaidTariff.Silver,
            twoWeek
        )
        const checkBronze = await promotion.usersTariff(
            PaidTariff.Bronze,
            sevenDays
        )

        expect(checkGoldPlus).to.eq(goldPlus)
        expect(checkGold).to.eq(gold)
        expect(checkSilver).to.eq(silver)
        expect(checkBronze).to.eq(bronze)
    })

    it('Should be able to promoteQuest(): success', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            feeReceiver,
            service,
            priceOracle,
            usdt,
            pension_fund,
            referral,
            work_quest_factory,
            work_quest,
            promotion,
        } = await loadFixture(deployWithFixture)

        const validQuest = await work_quest_factory
            .connect(employer)
            .workquestValid(work_quest.address)
        expect(validQuest).to.eq(true)
        const goldPlus = Mwei('60')
        const gold = Mwei('40')
        const silver = Mwei('30')
        const bronze = Mwei('20')

        await promotion.setQuestTariff(0, fiftyDays, goldPlus)
        await promotion.setQuestTariff(1, oneMoth, gold)
        await promotion.setQuestTariff(2, twoWeek, silver)
        await promotion.setQuestTariff(3, sevenDays, bronze)

        const checkGoldPlus = await promotion.questTariff(
            PaidTariff.GoldPlus,
            fiftyDays
        )
        expect(checkGoldPlus).to.eq(goldPlus)

        await usdt.connect(employer).approve(promotion.address, goldPlus)
        const promoteTx = await promotion
            .connect(employer)
            .promoteQuest(work_quest.address, PaidTariff.GoldPlus, fiftyDays)
        
        await expect(promoteTx)
            .to.emit(promotion, 'PromotedQuest')
            .withArgs(
                work_quest.address,
                PaidTariff.GoldPlus,
                fiftyDays,
                anyValue,
                checkGoldPlus
            )
    })

    it('Should be able to promoteUser(): success', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            feeReceiver,
            service,
            priceOracle,
            usdt,
            pension_fund,
            referral,
            work_quest_factory,
            work_quest,
            promotion,
        } = await loadFixture(deployWithFixture)

        const validQuest = await work_quest_factory
            .connect(employer)
            .workquestValid(work_quest.address)
        expect(validQuest).to.eq(true)
        const goldPlus = Mwei('60')
        const gold = Mwei('40')
        const silver = Mwei('30')
        const bronze = Mwei('20')

        await promotion.setUserTariff(0, fiftyDays, goldPlus)
        await promotion.setUserTariff(1, oneMoth, gold)
        await promotion.setUserTariff(2, twoWeek, silver)
        await promotion.setUserTariff(3, sevenDays, bronze)

        const checkGoldPlus = await promotion.usersTariff(
            PaidTariff.GoldPlus,
            fiftyDays
        )
        expect(checkGoldPlus).to.eq(goldPlus)

        await usdt.connect(employer).approve(promotion.address, goldPlus)
        const promoteTx = await promotion
            .connect(employer)
            .promoteUser(PaidTariff.GoldPlus, fiftyDays)

        await expect(promoteTx)
            .to.emit(promotion, 'PromotedUser')
            .withArgs(
                employer.address,
                PaidTariff.GoldPlus,
                fiftyDays,
                anyValue,
                checkGoldPlus
            )
    })

    async function impersonate(account) {
        await hre.network.provider.request({
            method: 'hardhat_impersonateAccount',
            params: [account],
        })
    }

    async function resetFork() {
        await hre.network.provider.request({
            method: 'hardhat_reset',
            params: [
                {
                    forking: {
                        jsonRpcUrl: `https://mainnet.infura.io/v3/1d1afdfaea454548a5fed4a5030eca65`,
                        blockNumber: 15048152,
                    },
                },
            ],
        })
    }

    async function oracleSetPrice(price, symbol) {
        nonce += 1
        let message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: [price.toString()] },
            { t: 'uint256', v: [Mwei('2').toString()] },
            { t: 'string', v: [symbol] }
        )
        let signature = await web3.eth.sign(message, service.address)

        let sig = ethers.utils.splitSignature(signature)
        let current_timestamp = (
            await web3.eth.getBlock(await web3.eth.getBlockNumber())
        ).timestamp

        ethers.provider.send('evm_setNextBlockTimestamp', [
            current_timestamp + VALID_TIME,
        ])
        await priceOracle.setTokenPricesUSD(
            nonce,
            sig.v,
            sig.r,
            sig.s,
            [price],
            [Mwei('2').toString()],
            [symbol]
        )
        await hre.ethers.provider.send('evm_mine', [])
    }
})
