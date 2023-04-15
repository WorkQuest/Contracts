const { expect } = require('chai')
const { ethers, web3 } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')
const BigNumber = require('bignumber.js')
BigNumber.config({ EXPONENTIAL_AT: 60 })
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')

const Mwei = (value) => ethers.utils.parseUnits(value, 6)
const toWei = (value) => ethers.utils.parseUnits(value, 18)
const toBN = (num) => {
    if (typeof num == 'string') return new BigNumber(num)
    return new BigNumber(num.toString())
}

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7' //USDT contract
const USDT_WAHLE = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503'
const ETH_WAHLE = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503'

const job_hash = web3.utils.keccak256('JOBHASH')
const cost = Mwei('100')
const comission = Mwei('0.01')
const cost_comission = Mwei('102')
const EMPLOYER_FEE = Mwei('0.012')
const WORKER_FEE = Mwei('0.01')
const TX_FEE = Mwei('0.011')
const PENSION_LOCK_TIME = 60
const PENSION_DEFAULT_FEE = Mwei('0.01')
const PENSION_FEE_PER_MONTH = Mwei('0.0012')
const PENSION_FEE_WITHDRAW = Mwei('0.005')
const VALID_TIME = 1000
const PRICE = Mwei('30')
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

let whaleUsdt
let usdt
let wqt
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
let pension_fund
let oneK = toWei('1000')
let twoK = toWei('2000')
const twentyWQT = toWei('20')

describe('WQreferral USDT', function () {
    async function deployWithFixture() {
        await resetFork()
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

        usdt = await ethers.getContractAt('IERC20', USDT)
        await impersonate(USDT_WAHLE)
        whaleUsdt = await ethers.getSigner( USDT_WAHLE )
        await impersonate(ETH_WAHLE)
        whaleEth = await ethers.getSigner(ETH_WAHLE)
        await usdt.deployed()
        await usdt.connect(whaleUsdt).transfer(employer.address, Mwei('200000'))

        // ========================================================================================

        const BridgeToken = await ethers.getContractFactory('WQBridgeToken')
        wqt = await upgrades.deployProxy(
            BridgeToken,
            ['WQT stablecoin', 'WQT', 18],
            { kind: 'transparent' }
        )

        await wqt.deployed()
        await wqt.grantRole(await wqt.MINTER_ROLE(), work_quest_owner.address)
        await wqt.mint(employer.address, twoK)

        // ========================================================================================

        const WQReferralContract = await ethers.getContractFactory('WQReferral')
        referral_contract = await upgrades.deployProxy(
            WQReferralContract,
            [priceOracle.address, service.address, twentyWQT, oneK],
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
                usdt.address,
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
                usdt.address,
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )

        await work_quest_factory.deployed()
        await referral_contract.setFactory(work_quest_factory.address)

        await work_quest_factory.grantRole(
            await work_quest_factory.ARBITER_ROLE(),
            arbiter.address
        )

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

        return {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            service,
            priceOracle,
            usdt,
            work_quest,
            referral_contract,
            pension_fund,
        }
    }

    it('add referral', async function () {
        const {
            employer,
            worker,
            service,
            priceOracle,
            usdt,
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
            usdt,
            work_quest,
            referral_contract,
        } = await loadFixture(deployWithFixture)

        const info = await work_quest.connect(employer).getInfo()
        expect(info._status).to.eq(JobStatus.Published)

        const workquest_valid = await work_quest_factory.workquestValid(
            work_quest.address
        )
        expect(workquest_valid).to.eq(true)

        const balanceWQ = await usdt.balanceOf(work_quest.address)
        expect(balanceWQ.toString()).to.eq(cost.toString())

        const comission = (cost * EMPLOYER_FEE) / 1e6
        const feeReceiverBalance = await usdt.balanceOf(feeReceiver.address)
        expect(feeReceiverBalance.toString()).to.eq(comission.toString())
    })

    it('should be status Published: success', async function () {
        const { employer, work_quest } = await loadFixture(deployWithFixture)

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
        const { employer, worker, work_quest } = await loadFixture(
            deployWithFixture
        )

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
        const { employer, worker, work_quest } = await loadFixture(
            deployWithFixture
        )

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
            pension_fund,
        } = await loadFixture(deployWithFixture)

        const balanceWorkerBefore = await usdt.balanceOf(worker.address)

        await work_quest.connect(employer).assignJob(worker.address)
        await work_quest.connect(worker).acceptJob()
        await work_quest.connect(worker).verificationJob()
        await work_quest.connect(employer).acceptJobResult()

        const pensionFee = await pension_fund.getFee(worker.address)
        const comission = toBN(cost)
            .multipliedBy(toBN(WORKER_FEE))
            .div(toBN(1e6))
        const pensionContribute = toBN(cost)
            .multipliedBy(toBN(pensionFee))
            .div(toBN(1e6))
        const newCost = toBN(cost)
            .minus(toBN(comission))
            .minus(toBN(pensionContribute))
        const newBalance = toBN(balanceWorkerBefore).plus(toBN(newCost))
        const balanceWorkerAfter = await usdt.balanceOf(worker.address)
        expect(balanceWorkerAfter.toString()).to.eq(newBalance.toString())
    })

    it('calculate referral', async function () {
        const {
            employer,
            worker,
            service,
            usdt,
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

        const referralInfoWorker = await referral_contract
            .connect(worker)
            .referrals(worker.address)
        expect(referralInfoWorker.affiliat).to.eq(employer.address)
        expect(referralInfoWorker.earnedAmount).to.eq(cost)

        const verifyQuest = await await work_quest.connect(employer).getInfo()
        expect(verifyQuest._jobHash).to.eq(job_hash)
        expect(verifyQuest._cost).to.eq(cost)
        expect(verifyQuest._employer).to.eq(employer.address)
        expect(verifyQuest._worker).to.eq(worker.address)
        expect(verifyQuest._factory).to.eq(work_quest_factory.address)
        expect(verifyQuest._status).to.eq(JobStatus.Finished)
    })

    it('calculate referral: referralBonus', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            service,
            usdt,
            work_quest,
            referral_contract,
        } = await loadFixture(deployWithFixture)

        const newEarnedThreshold = toWei('99')
        await referral_contract.setEarnedThreshold(newEarnedThreshold)
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

        const referralInfoWorker = await referral_contract
            .connect(worker)
            .referrals(worker.address)
        expect(referralInfoWorker.affiliat).to.eq(employer.address)
        expect(referralInfoWorker.earnedAmount).to.eq(cost)
        expect(referralInfoWorker.paid).to.eq(true)

        const referralInfoEmployee = await referral_contract
            .connect(employer)
            .referrals(employer.address)
        expect(referralInfoEmployee.rewardTotal).to.eq(twentyWQT.toString())
        expect(referralInfoEmployee.referredCount).to.eq(1)

        const verifyQuest = await await work_quest.connect(employer).getInfo()
        expect(verifyQuest._jobHash).to.eq(job_hash)
        expect(verifyQuest._cost).to.eq(cost)
        expect(verifyQuest._employer).to.eq(employer.address)
        expect(verifyQuest._worker).to.eq(worker.address)
        expect(verifyQuest._factory).to.eq(work_quest_factory.address)
        expect(verifyQuest._status).to.eq(JobStatus.Finished)
    })

    it.only('should be able to claim()', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            service,
            usdt,
            work_quest,
            referral_contract,
        } = await loadFixture(deployWithFixture)
        await wqt.mint( referral_contract.address, twoK )
        await whaleEth.sendTransaction({
            to: referral_contract.address,
            value: '8842815932975',
        })
        const newEarnedThreshold = toWei('99')
        await referral_contract.setEarnedThreshold(newEarnedThreshold)
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

        const referralInfoWorker = await referral_contract
            .connect(worker)
            .referrals(worker.address)
        expect(referralInfoWorker.affiliat).to.eq(employer.address)
        expect(referralInfoWorker.earnedAmount).to.eq(cost)
        expect(referralInfoWorker.paid).to.eq(true)

        const referralInfoEmployee = await referral_contract
            .connect(employer)
            .referrals(employer.address)
        expect(referralInfoEmployee.rewardTotal).to.eq(twentyWQT.toString())
        expect(referralInfoEmployee.referredCount).to.eq(1)

        const balance0ETH = await ethers.provider.getBalance(
            work_quest_owner.address
        )
        
        const tx = await ethers.provider.getBalance(referral_contract.address)
        console.log("value", tx.toString())
        await referral_contract.connect(employer).claim()
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
