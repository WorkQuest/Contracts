const { expect } = require('chai')
const { ethers, web3 } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther, commify } = require('ethers/lib/utils')
const BigNumber = require('bignumber.js')
BigNumber.config({ EXPONENTIAL_AT: 60 })

const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')

const job_hash = web3.utils.keccak256('JOBHASH')
const cost = parseEther('100')
const comission = parseEther('0.01')
const cost_comission = parseEther('102')
const reward = parseEther('0.99')
const forfeit = parseEther('0.1')
const reward_after_forfeit = parseEther('0.891')
const acces_denied_err = 'WorkQuest: Access denied or invalid status'
const EMPLOYER_FEE = parseEther('0.012')
const WORKER_FEE = parseEther('0.01')
const TX_FEE = parseEther('0.011')
const PENSION_LOCK_TIME = 60
const PENSION_DEFAULT_FEE = parseEther('0.01')
const PENSION_FEE_PER_MONTH = parseEther('0.0012')
const PENSION_FEE_WITHDRAW = parseEther('0.005')
const VALID_TIME = 1000
const PRICE = parseEther('30')
const SYMBOL = 'WQT'
const nullAddress = '0x0000000000000000000000000000000000000000'

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
let nonce = 1
let work_quest_owner
let employer
let service
let worker
let arbiter
let feeReceiver
let work_quest_factory
let work_quest
let affiliat
let referral_contract
let priceOracle
let wusd_stablecoin
let pension_fund
let oneK = parseEther('1000')
const twentyWQT = parseEther('20')

const toWei = (value) => utils.parseUnits(value, 18)
const toBN = (num) => {
    if (typeof num == 'string') return new BigNumber(num)
    return new BigNumber(num.toString())
}

describe('WQreferral', function () {
    async function deployWithFixture() {
        ;[
            work_quest_owner,
            employer,
            affiliat,
            worker,
            arbiter,
            feeReceiver,
            service,
        ] = await ethers.getSigners()

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

        const BridgeToken = await ethers.getContractFactory('WQBridgeToken')
        wusd_stablecoin = await upgrades.deployProxy(
            BridgeToken,
            ['WUSD stablecoin', 'WUSD', 18],
            { kind: 'transparent' }
        )

        await wusd_stablecoin.deployed()
        await wusd_stablecoin.grantRole(
            await wusd_stablecoin.MINTER_ROLE(),
            work_quest_owner.address
        )
        await wusd_stablecoin.mint(employer.address, oneK)

        // ========================================================================================

        const WQReferralContract = await ethers.getContractFactory('WQReferral')
        referral_contract = await upgrades.deployProxy(
            WQReferralContract,
            [
                priceOracle.address,
                service.address,
                twentyWQT,
                parseEther('1000'),
            ],
            { kind: 'transparent' }
        )

        await referral_contract.deployed()
        await referral_contract.grantRole(
            await referral_contract.SERVICE_ROLE(),
            service.address
        )

        // ========================================================================================

        const PensionFund = await ethers.getContractFactory('WQPensionFund')
        pension_fund = await upgrades.deployProxy(
            PensionFund,
            [
                PENSION_LOCK_TIME,
                PENSION_DEFAULT_FEE,
                wusd_stablecoin.address,
                feeReceiver.address,
                PENSION_FEE_PER_MONTH,
                PENSION_FEE_WITHDRAW,
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await pension_fund.deployed()

        // ========================================================================================

        const WorkQuestFactory = await ethers.getContractFactory(
            'WorkQuestFactory'
        )
        work_quest_factory = await upgrades.deployProxy(
            WorkQuestFactory,
            [
                EMPLOYER_FEE, // 0.012
                WORKER_FEE, // 0.01
                TX_FEE, // 0.011
                feeReceiver.address,
                pension_fund.address,
                referral_contract.address,
                wusd_stablecoin.address,
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )

        await work_quest_factory.deployed()
        await referral_contract.setFactory(work_quest_factory.address)

        await work_quest_factory.grantRole(
            await work_quest_factory.ARBITER_ROLE(),
            arbiter.address
        )

        await wusd_stablecoin
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
            arbiter,
            feeReceiver,
            affiliat,
            service,
            priceOracle,
            wusd_stablecoin,
            work_quest,
            referral_contract,
        }
    }

    it('add referral', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            service,
            priceOracle,
            wusd_stablecoin,
            work_quest,
            referral_contract,
        } = await loadFixture(deployWithFixture)

        const role = await referral_contract.hasRole(
            await referral_contract.SERVICE_ROLE(),
            service.address
        )
        expect(role).to.eq(true)

        const message = web3.utils.soliditySha3(
            { t: 'address', v: employer.address },
            { t: 'address', v: [worker.address] }
        )

        const signature = await web3.eth.sign(message, service.address)
        const sig = ethers.utils.splitSignature(signature)
        await referral_contract
            .connect(employer)
            .addReferrals(sig.v, sig.r, sig.s, [worker.address])
        const referralInfo = await referral_contract.referrals(worker.address)
        expect(referralInfo.affiliat).to.eq(employer.address)
    })

    it('create a new WorkQuest: success', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            service,
            priceOracle,
            wusd_stablecoin,
            work_quest,
            referral_contract,
        } = await loadFixture(deployWithFixture)

        const info = await work_quest.connect(employer).getInfo()
        expect(info[5]).to.eq(JobStatus.Published)

        const workquest_valid = await work_quest_factory.workquestValid(
            work_quest.address
        )
        expect(workquest_valid).to.eq(true)

        const balanceWQ = await wusd_stablecoin.balanceOf(work_quest.address)
        expect(balanceWQ.toString()).to.eq(cost.toString())

        const comission = (cost * EMPLOYER_FEE) / 1e18
        const feeReceiverBalance = await wusd_stablecoin.balanceOf(
            feeReceiver.address
        )
        expect(feeReceiverBalance.toString()).to.eq(comission.toString())
    })

    it('should be status Published: success', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            service,
            priceOracle,
            wusd_stablecoin,
            work_quest,
            referral_contract,
        } = await loadFixture(deployWithFixture)

        const info = await work_quest.connect(employer).getInfo()
        expect(info._jobHash).to.eq(job_hash)
        expect(info._cost).to.eq(cost)
        expect(info._employer).to.eq(employer.address)
        expect(info._worker).to.eq(nullAddress)
        expect(info._factory).to.eq(work_quest_factory.address)
        expect(info._status).to.eq(JobStatus.Published)
        expect(info._deadline).to.eq(deadline)
    })

    it('assigning to WorkQuest: success', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            service,
            priceOracle,
            wusd_stablecoin,
            work_quest,
            referral_contract,
        } = await loadFixture(deployWithFixture)

        await work_quest.connect(employer).assignJob(worker.address)
        const info = await work_quest.connect(employer).getInfo()
        expect(info._jobHash).to.eq(job_hash)
        expect(info._cost).to.eq(cost)
        expect(info._employer).to.eq(employer.address)
        expect(info._worker).to.eq(worker.address)
        expect(info._factory).to.eq(work_quest_factory.address)
        expect(info._status).to.eq(JobStatus.WaitWorker)
        expect(info._deadline).to.eq(deadline)
    })

    it('should be able to acceptJob WorkQuest: success', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            service,
            priceOracle,
            wusd_stablecoin,
            work_quest,
            referral_contract,
        } = await loadFixture(deployWithFixture)

        await work_quest.connect(employer).assignJob(worker.address)
        await work_quest.connect(worker).acceptJob()
        const info = await work_quest.connect(employer).getInfo()
        expect(info._jobHash).to.eq(job_hash)
        expect(info._cost).to.eq(cost)
        expect(info._employer).to.eq(employer.address)
        expect(info._worker).to.eq(worker.address)
        expect(info._factory).to.eq(work_quest_factory.address)
        expect(info._status).to.eq(JobStatus.InProgress)
        expect(info._deadline).to.eq(deadline)
    })

    it('should be verificationJob: success', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            service,
            priceOracle,
            wusd_stablecoin,
            work_quest,
            referral_contract,
        } = await loadFixture(deployWithFixture)

        await work_quest.connect(employer).assignJob(worker.address)
        await work_quest.connect(worker).acceptJob()
        await work_quest.connect(worker).verificationJob()
        const verifyQuest = await await work_quest.connect(employer).getInfo()
        expect(verifyQuest._jobHash).to.eq(job_hash)
        expect(verifyQuest._cost).to.eq(cost)
        expect(verifyQuest._employer).to.eq(employer.address)
        expect(verifyQuest._worker).to.eq(worker.address)
        expect(verifyQuest._factory).to.eq(work_quest_factory.address)
        expect(verifyQuest._status).to.eq(JobStatus.WaitJobVerify)
    })

    it('should be acceptJobResult: success', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            service,
            priceOracle,
            wusd_stablecoin,
            work_quest,
            referral_contract,
        } = await loadFixture(deployWithFixture)

        const comission_transferFunds = (cost * WORKER_FEE) / 1e18 // 1000000000000000000
        const feeReceiverBalanceBefore = await wusd_stablecoin.balanceOf(
            feeReceiver.address
        ) // 1200000000000000000

        const info = await await work_quest.connect(employer).getInfo()
        expect(info._jobHash).to.eq(job_hash)
        expect(info._cost).to.eq(cost)
        expect(info._employer).to.eq(employer.address)
        expect(info._worker).to.eq(nullAddress)
        expect(info._factory).to.eq(work_quest_factory.address)
        expect(info._status).to.eq(JobStatus.Published)

        await work_quest.connect(employer).assignJob(worker.address)
        await work_quest.connect(worker).acceptJob()
        await work_quest.connect(worker).verificationJob()
        await work_quest.connect(employer).acceptJobResult()

        const verifyQuest = await await work_quest.connect(employer).getInfo()
        expect(verifyQuest._jobHash).to.eq(job_hash)
        expect(verifyQuest._cost).to.eq(cost)
        expect(verifyQuest._employer).to.eq(employer.address)
        expect(verifyQuest._worker).to.eq(worker.address)
        expect(verifyQuest._factory).to.eq(work_quest_factory.address)
        expect(verifyQuest._status).to.eq(JobStatus.Finished)

        const workerBalanceAfter = await wusd_stablecoin
            .connect(worker)
            .balanceOf(worker.address)
        expect(workerBalanceAfter.toString()).to.eq(
            (cost - comission_transferFunds).toString()
        )

        const feeReceiverBalanceAfter = await wusd_stablecoin.balanceOf(
            feeReceiver.address
        ) // 2200000000000000000
        expect(feeReceiverBalanceAfter - feeReceiverBalanceBefore).to.eq(
            comission_transferFunds
        )
        const pensionContribute = (cost * PENSION_DEFAULT_FEE) / 1e18 // 1
    })

    it.only('calculate referral', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            service,
            priceOracle,
            wusd_stablecoin,
            work_quest,
            referral_contract,
        } = await loadFixture(deployWithFixture)

        const role = await referral_contract.hasRole(
            await referral_contract.SERVICE_ROLE(),
            service.address
        )
        expect(role).to.eq(true)

        const message = web3.utils.soliditySha3(
            { t: 'address', v: employer.address },
            { t: 'address', v: [worker.address] }
        )

        const signature = await web3.eth.sign(message, service.address)
        const sig = ethers.utils.splitSignature(signature)
        await referral_contract
            .connect(employer)
            .addReferrals(sig.v, sig.r, sig.s, [worker.address])
        const referralInfo = await referral_contract.referrals(worker.address)
        expect(referralInfo.affiliat).to.eq(employer.address)

        await work_quest.connect(employer).assignJob(worker.address)
        await work_quest.connect(worker).acceptJob()
        await work_quest.connect(worker).verificationJob()
        await work_quest.connect(employer).acceptJobResult()

        const referralInfoWorker = await referral_contract.connect( worker ).referrals( worker.address )
        expect(referralInfoWorker.affiliat).to.eq(employer.address)
        expect( referralInfoWorker.earnedAmount ).to.eq(cost)
    })

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
