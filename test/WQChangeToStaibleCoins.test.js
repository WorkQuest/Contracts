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

const JobStatus = Object.freeze({
    New: 0,
    Published: 1,
    WaitWorker: 2,
    InProgress: 3,
    WaitJobVerify: 4,
    Arbitration: 5,
    Finished: 6,
})

const toBN = (num) => {
    if (typeof num == 'string') return new BigNumber(num)
    return new BigNumber(num.toString())
}

const job_hash = web3.utils.keccak256('JOBHASH')
const cost = parseEther('2')
const comission = parseEther('0.01')
const cost_comission = parseEther('2.03')
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
const USDT_SYMBOL = 'USDT'
const nullAddress = '0x0000000000000000000000000000000000000000'

const USDT_WAHLE = '0xab5801a7d398351b8be11c439e05c5b3259aec9b'
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7' //USDT contract
const amountUSDT = '200000000'

let work_quest_owner
let employer
let whaleUsdt
let worker
let arbiter
let feeReceiver
let work_quest_factory
let work_quest
let affiliat
let referral_contract
let priceOracle
let wusd_stablecoin
let usdt_token
let pension_fund
let nonce = 1
let oneK = parseEther('1000')
let twentyWQT = parseEther('20')
let deadline = '9999999999'

describe('Work Quest test', function () {
    async function deployWithFixture() {
        await resetFork()
        ;[
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
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

        await impersonate(USDT_WAHLE)
        usdt_token = await ethers.getContractAt( 'IERC20', USDT )
        whaleUsdt = await ethers.getSigner(USDT_WAHLE)
        await usdt_token
            .connect(whaleUsdt)
            .transfer(employer.address, amountUSDT)

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
                EMPLOYER_FEE,
                WORKER_FEE,
                TX_FEE,
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
            .approve( work_quest_factory.address, cost_comission )
        
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
            usdt_token,
            work_quest_factory,
            USDT_WAHLE,
            wusd_stablecoin,
            referral_contract,
            pension_fund,
            work_quest,
        }
    }

    it('Should set the admin roles to creator and fee', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            service,
            priceOracle,
            usdt_token,
            USDT_WAHLE,
            wusd_stablecoin,
            work_quest,
        } = await loadFixture(deployWithFixture)

        const default_admin_role = await work_quest_factory.DEFAULT_ADMIN_ROLE()
        const admin_role = await work_quest_factory.ADMIN_ROLE()
        const arbiter_role = await work_quest_factory.ARBITER_ROLE()

        expect(
            await work_quest_factory.hasRole(
                default_admin_role,
                work_quest_owner.address
            )
        ).to.eq(true)

        expect(
            await work_quest_factory.hasRole(
                admin_role,
                work_quest_owner.address
            )
        ).to.eq(true)

        expect(
            await work_quest_factory.hasRole(arbiter_role, arbiter.address)
        ).to.eq(true)
    })

    it('Create new job: success', async function () {
        const { employer, feeReceiver, wusd_stablecoin, work_quest } =
            await loadFixture(deployWithFixture)

        expect(await work_quest_factory.feeEmployer()).to.eq(EMPLOYER_FEE)
        expect(await work_quest_factory.feeWorker()).to.eq(WORKER_FEE)
        expect(await work_quest_factory.feeTx()).to.eq(TX_FEE)
        expect(await work_quest_factory.feeReceiver()).to.eq(
            feeReceiver.address
        )

        expect(await work_quest_factory.referral()).to.eq(
            referral_contract.address
        )
        expect(await work_quest_factory.wusd()).to.eq(wusd_stablecoin.address)
        expect(await work_quest.factory()).to.eq(work_quest_factory.address)

        const info = await work_quest.connect(employer).getInfo()
        expect(info._jobHash).to.eq(job_hash)
        expect(info._cost).to.eq(cost)
        expect(info._employer).to.eq(employer.address)
        expect(info._worker).to.eq(nullAddress)
        expect(info._factory).to.eq(work_quest_factory.address)
        expect(info._status).to.eq(JobStatus.Published)
        expect(info._deadline).to.eq(deadline)
    })

    it('Assigning job: success', async function () {
        const { employer, worker, work_quest } = await loadFixture(
            deployWithFixture
        )
        await work_quest.connect(employer).assignJob(worker.address)
        const questInfo = await work_quest.connect(employer).getInfo()
        expect(questInfo._jobHash).to.eq(job_hash)
        expect(questInfo._cost).to.eq(cost)
        expect(questInfo._employer).to.eq(employer.address)
        expect(questInfo._worker).to.eq(worker.address)
        expect(questInfo._factory).to.eq(work_quest_factory.address)
        expect(questInfo._status).to.eq(JobStatus.WaitWorker)
        expect(questInfo._deadline).to.eq(deadline)
    })

    it('Worker accepted job from status WaitWorker: success', async function () {
        const { employer, worker, work_quest } = await loadFixture(
            deployWithFixture
        )

        await work_quest.connect(employer).assignJob(worker.address)
        await work_quest.connect(worker).acceptJob()
        const questInfo = await work_quest.connect(employer).getInfo()
        expect(questInfo._jobHash).to.eq(job_hash)
        expect(questInfo._cost).to.eq(cost)
        expect(questInfo._employer).to.eq(employer.address)
        expect(questInfo._worker).to.eq(worker.address)
        expect(questInfo._factory).to.eq(work_quest_factory.address)
        expect(questInfo._status).to.eq(JobStatus.InProgress)
    })

    it('Set verification status: success', async function () {
        const {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            service,
            priceOracle,
            usdt_token,
            USDT_WAHLE,
            wusd_stablecoin,
            work_quest,
        } = await loadFixture( deployWithFixture )
        
        await work_quest.connect( employer ).assignJob( worker.address )
        await work_quest.connect( worker ).acceptJob()
        const questInfo = await work_quest.connect(employer).getInfo()
        expect(questInfo._jobHash).to.eq(job_hash)
        expect(questInfo._cost).to.eq(cost)
        expect(questInfo._employer).to.eq(employer.address)
        expect(questInfo._worker).to.eq(worker.address)
        expect(questInfo._factory).to.eq(work_quest_factory.address)
        expect( questInfo._status ).to.eq( JobStatus.InProgress )
        
        await work_quest.connect(worker).verificationJob()
        const questInfoAfter = await work_quest.connect(employer).getInfo()
        expect(questInfoAfter._jobHash).to.eq(job_hash)
        expect(questInfoAfter._cost).to.eq(cost)
        expect(questInfoAfter._employer).to.eq(employer.address)
        expect(questInfoAfter._worker).to.eq(worker.address)
        expect(questInfoAfter._factory).to.eq(work_quest_factory.address)
        expect(questInfoAfter._status).to.eq(JobStatus.WaitJobVerify)
        expect(questInfoAfter._deadline).to.eq(deadline)
    } )
    
    describe( 'Change WUSD to USDT', function () {
        it('Set address of USDT token', async function () {
            const {
                work_quest_owner,
                employer,
                worker,
                arbiter,
                feeReceiver,
                affiliat,
                service,
                priceOracle,
                work_quest_factory,
                usdt_token,
                USDT_WAHLE,
                wusd_stablecoin,
                work_quest,
            } = await loadFixture( deployWithFixture )
            const job_hash2 = web3.utils.keccak256( 'JOBHASH2' )
            const cost_comission_usdt = '0000001'
            const cost2 = '2000000'

            await work_quest_factory.setWusd( usdt_token.address )
            const usdtToken = await work_quest_factory.wusd()
            expect( usdtToken ).to.eq( usdt_token.address )

            const employerUsdtBalance = await usdt_token.connect( employer ).balanceOf( employer.address )
            expect(employerUsdtBalance).to.eq(amountUSDT.toString())
            
            await usdt_token
                .connect(employer)
                .approve(work_quest_factory.address, cost_comission_usdt)
        })
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

    // Allows to access the wallet of an account address
    async function impersonate(account) {
        await hre.network.provider.request({
            method: 'hardhat_impersonateAccount',
            params: [account],
        })
    }
})
