const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'))
const { expect } = require('chai')
const { ethers } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther, commify } = require('ethers/lib/utils')
const BigNumber = require('bignumber.js')
BigNumber.config({ EXPONENTIAL_AT: 60 })

const { loadFixture } = require('ethereum-waffle')

const nullstr = '0x0000000000000000000000000000000000000000'
const job_hash = web3.utils.keccak256('JOBHASH')
const cost = parseEther('1')
const comission = parseEther('0.01')
const cost_comission = parseEther('1.01')
const reward = parseEther('0.99')
const forfeit = parseEther('0.1')
const reward_after_forfeit = parseEther('0.891')
const acces_denied_err = 'WorkQuest: Access denied or invalid status'
const WORKQUEST_FEE = '10000000000000000'
const PENSION_LOCK_TIME = '60'
const PENSION_DEFAULT_FEE = '10000000000000000'
const PENSION_FEE_PER_MONTH = '1200000000000000'
const PENSION_FEE_WITHDRAW = '5000000000000000'
const VALID_TIME = '600'
const PRICE = parseEther('30')
const SYMBOL = 'WQT'
const twentyBucksInWQT = (20 / 228).toFixed(18) // TODO 228 is fixed value that oracle returns now

const JobStatus = Object.freeze({
    New: 0,
    Published: 1,
    WaitWorker: 2,
    InProgress: 3,
    WaitJobVerify: 4,
    Arbitration: 5,
    Finished: 6,
})

let deadline = '9999999999'
let work_quest_owner
let employer
let worker
let arbiter
let feeReceiver
let work_quest_factory
let work_quest
let affiliat
let referral
let priceOracle
let wusd_token
let pension_fund
let oneK = parseEther('1000')
const twentyWQT = parseEther('20')

describe('WQreferral', function () {
    async function deployWithFixture() {
        ;[
            owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            validator,
        ] = await ethers.getSigners()

        // =============================== Price Oracle ==============================================

        const PriceOracle = await ethers.getContractFactory('WQPriceOracle')
        priceOracle = await upgrades.deployProxy(
            PriceOracle,
            [service.address, VALID_TIME],
            { kind: 'transparent' }
        )

        await priceOracle.deployed()
        await priceOracle.updateToken(1, SYMBOL)

        await oracleSetPrice(PRICE, SYMBOL)

        // =============================== BridgeToken ==============================================

        const BridgeToken = await ethers.getContractFactory('WQBridgeToken')
        wusd_token = await upgrades.deployProxy(
            BridgeToken,
            ['WUSD stablecoin', 'WUSDT', 18],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await wusd_token.deployed()
        await wusd_token.grantRole(
            await wusd_token.MINTER_ROLE(),
            work_quest_owner.address
        )

        await wusd_token.mint(employer.address, oneK)

        // =============================================================================

        const PensionFund = await ethers.getContractFactory('WQPensionFund')
        pension_fund = await upgrades.deployProxy(
            PensionFund,
            [
                PENSION_LOCK_TIME,
                PENSION_DEFAULT_FEE,
                wusd_token.address,
                feeReceiver.address,
                PENSION_FEE_PER_MONTH,
                PENSION_FEE_WITHDRAW,
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await pension_fund.deployed()

        // =============================================================================

        const WQReferralContract = await ethers.getContractFactory('WQReferral')
        referral = await upgrades.deployProxy(
            WQReferralContract,
            [
                priceOracle.address,
                validator.address,
                twentyWQT,
                parseEther('1000'),
            ],
            {
                initializer: 'initialize',
                kind: 'transparent',
            }
        )

        await referral.deployed()
        await referral.grantRole(
            await referral.SERVICE_ROLE(),
            validator.address
        )

        // =============================================================================

    //     const WorkQuestFactory = await ethers.getContractFactory(
    //         'WorkQuestFactory'
    //     )
    //     work_quest_factory = await upgrades.deployProxy(
    //         WorkQuestFactory,
    //         [
    //             WORKQUEST_FEE,
    //             WORKQUEST_FEE,
    //             WORKQUEST_FEE,
    //             feeReceiver.address,
    //             pension_fund.address,
    //             referral.address,
    //             wusd_token.address,
    //         ],
    //         { initializer: 'initialize', kind: 'transparent' }
    //     )

    //     await work_quest_factory.deployed()
    //     await referral.setFactory(work_quest_factory.address)
    //     await work_quest_factory.grantRole(
    //         await work_quest_factory.ARBITER_ROLE(),
    //         arbiter.address
    //     )
    //     await wusd_token
    //         .connect(employer)
    //         .approve(work_quest_factory.address, cost_comission)

    //     await work_quest_factory
    //         .connect(employer)
    //         .newWorkQuest(job_hash, cost, deadline, 1)

    //     let work_quest_address = (
    //         await work_quest_factory.getWorkQuests(employer.address, 0, 1)
    //     )[0]

    //     work_quest = await ethers.getContractAt('WorkQuest', work_quest_address)
    //     await work_quest.deployed()

    //     return {
    //         work_quest_owner,
    //         employer,
    //         worker,
    //         arbiter,
    //         feeReceiver,
    //         affiliat,
    //         validator,
    //         wusd_token,
    //         pension_fund,
    //         priceOracle,
    //         referral,
    //         work_quest_factory,
    //         work_quest,
    //     }
    }

    // it('should calculate referral', async function () {
    //     const {
    //         work_quest_owner,
    //         employer,
    //         worker,
    //         arbiter,
    //         feeReceiver,
    //         affiliat,
    //         validator,
    //         wusd_token,
    //         pension_fund,
    //         priceOracle,
    //         referral,
    //         work_quest_factory,
    //         work_quest,
    //     } = await loadFixture(deployWithFixture)

    //     const info = await work_quest.connect(employer).getInfo()
    //     expect(info[5]).to.eq(JobStatus.Published)

    //     await work_quest.connect(employer).assignJob(worker.address)
    //     const infoQuest = await work_quest.connect(employer).getInfo()
    //     expect(infoQuest._worker).to.eq(worker.address)

    //     await work_quest.connect(worker).acceptJob()
    //     const infoWorker = await work_quest.connect(worker).getInfo()
    //     expect(infoWorker._status).to.eq(JobStatus.InProgress)

    //     await work_quest.connect(worker).verificationJob()
    //     const verifyQuest = await await work_quest.connect(employer).getInfo()
    //     expect(verifyQuest._jobHash).to.eq(job_hash)
    //     expect(verifyQuest._cost).to.eq(cost)
    //     expect(verifyQuest._employer).to.eq(employer.address)
    //     expect(verifyQuest._worker).to.eq(worker.address)
    //     expect(verifyQuest._factory).to.eq(work_quest_factory.address)
    //     expect(verifyQuest._status).to.eq(JobStatus.WaitJobVerify)

    //     expect(await wusd_token.balanceOf(work_quest.address)).to.eq(cost)
    //     const feeReceiverBefore = BigInt(
    //         await wusd_token.balanceOf(feeReceiver.address)
    //     )
    //     const workerBefore = BigInt(await wusd_token.balanceOf(worker.address))

    //     await work_quest.connect(employer).acceptJobResult()

    //     const feeReceiverAfter = BigInt(
    //         await wusd_token.balanceOf(feeReceiver.address)
    //     )
    //     const workerAfter = BigInt(await wusd_token.balanceOf(worker.address))

    //     expect(feeReceiverAfter - feeReceiverBefore).to.eq(comission)
    //     expect(workerAfter - workerBefore).to.eq(reward)
    //     expect(await wusd_token.balanceOf(work_quest.address)).to.be.equal(0)

    //     const statusQuest = await await work_quest.connect(employer).getInfo()
    //     expect(statusQuest._status).to.eq(JobStatus.Finished)
    // })

    async function oracleSetPrice(price, symbol) {
        nonce += 1
        let message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: [price.toString()] },
            { t: 'uint256', v: [parseEther('2').toString()] },
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
            [parseEther('2').toString()],
            [symbol]
        )
        await hre.ethers.provider.send('evm_mine', [])
    }
})
