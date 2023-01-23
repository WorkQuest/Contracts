const Web3 = require('web3')
const { expect } = require('chai')
const { ethers, web3 } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')
const {
    time,
    loadFixture,
} = require('@nomicfoundation/hardhat-network-helpers')
const BigNumber = require('bignumber.js');

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
    if (typeof num == "string") return new BigNumber(num);
    return new BigNumber(num.toString());
  };

const job_hash = web3.utils.keccak256('JOBHASH')
const cost = parseEther('1')
const comission = parseEther('0.01')
const cost_comission = parseEther('1.01')
const reward = parseEther('0.99')
const forfeit = parseEther('0.1')
const reward_after_forfeit = parseEther('0.891')
const acces_denied_err = 'WorkQuest: Access denied or invalid status'
const WORKQUEST_FEE = parseEther('0.01')
const PENSION_LOCK_TIME = 60
const PENSION_DEFAULT_FEE = parseEther('0.01')
const PENSION_FEE_PER_MONTH = parseEther('0.0012')
const PENSION_FEE_WITHDRAW = parseEther('0.005')
const VALID_TIME = 1000
const PRICE = parseEther('30')
const SYMBOL = 'WQT'
const nullAddress = '0x0000000000000000000000000000000000000000'

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
let nonce = 1
let oneK = parseEther('1000')
let twentyWQT = parseEther('20')
let deadline = '9999999999'

describe('Work Quest test', function () {
    async function deployWithFixture() {
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

        const BridgeToken = await ethers.getContractFactory('WQBridgeToken')
        wusd_token = await upgrades.deployProxy(
            BridgeToken,
            ['WUSD stablecoin', 'WUSD', 18],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await wusd_token.deployed()
        await wusd_token.grantRole(
            await wusd_token.MINTER_ROLE(),
            work_quest_owner.address
        )
        await wusd_token.mint(employer.address, oneK)

        // ========================================================================================

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

        // ========================================================================================

        const WQReferralContract = await ethers.getContractFactory('WQReferral')
        referral = await upgrades.deployProxy(
            WQReferralContract,
            [
                priceOracle.address,
                service.address,
                twentyWQT,
                parseEther('1000'),
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await referral.deployed()
        await referral.grantRole(await referral.SERVICE_ROLE(), service.address)

        // ========================================================================================

        const WorkQuestFactory = await hre.ethers.getContractFactory(
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
                wusd_token.address,
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )

        await work_quest_factory.deployed()
        await referral.setFactory(work_quest_factory.address)

        await work_quest_factory.grantRole(
            await work_quest_factory.ARBITER_ROLE(),
            arbiter.address
        )

        await wusd_token
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
            wusd_token,
            pension_fund,
            referral,
            work_quest_factory,
            work_quest,
        }
    }

    it('Should set the admin roles to creator and fee', async function () {
        const { work_quest_owner, feeReceiver, work_quest_factory } =
            await loadFixture(deployWithFixture)

        const default_admin_role = await work_quest_factory.DEFAULT_ADMIN_ROLE()
        const admin_role = await work_quest_factory.DEFAULT_ADMIN_ROLE()
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

        expect(
            await work_quest_factory.connect(work_quest_owner).feeWorker()
        ).to.equal(WORKQUEST_FEE)
        expect(
            await work_quest_factory.connect(work_quest_owner).feeEmployer()
        ).to.equal(WORKQUEST_FEE)
        expect(
            await work_quest_factory.connect(work_quest_owner).feeReceiver()
        ).to.equal(feeReceiver.address)
    })

    it('Create new job: success', async function () {
        const {
            employer,
            feeReceiver,
            wusd_token,
            pension_fund,
            referral,
            work_quest_factory,
            work_quest,
        } = await loadFixture(deployWithFixture)

        expect(await work_quest_factory.pensionFund()).to.eq(
            pension_fund.address
        )
        expect(await work_quest_factory.feeEmployer()).to.eq(WORKQUEST_FEE)
        expect(await work_quest_factory.feeWorker()).to.eq(WORKQUEST_FEE)
        expect(await work_quest_factory.feeTx()).to.eq(WORKQUEST_FEE)
        expect(await work_quest_factory.feeReceiver()).to.eq(
            feeReceiver.address
        )
        expect(await work_quest_factory.referral()).to.be.eq(referral.address)
        expect(await work_quest_factory.wusd()).to.eq(wusd_token.address)

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

    it('Assigning worker to job from not employer: fail', async function() {
        await expect(
            work_quest.connect(worker).assignJob(worker.address)
        ).revertedWith(acces_denied_err)
    })

    it('Assigning invalid worker: fail', async () => {
        await expect(
            work_quest.connect(employer).assignJob(nullAddress)
        ).revertedWith('WorkQuest: Invalid address')
    })

    it('Assign job from non Public statuses: fail', async function () {
        await work_quest.connect(employer).assignJob(worker.address)
        await work_quest.connect(worker).acceptJob()

        await expect(
            work_quest.connect(employer).assignJob(worker.address)
        ).revertedWith(acces_denied_err)

        await work_quest.connect(worker).verificationJob()
        await expect(
            work_quest.connect(employer).assignJob(worker.address)
        ).revertedWith(acces_denied_err)

        await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE })
        await expect(
            work_quest.connect(employer).assignJob(worker.address)
        ).revertedWith(acces_denied_err)

        await work_quest.connect(arbiter).arbitrationAcceptWork()
        await expect(
            work_quest.connect(employer).assignJob(worker.address)
        ).revertedWith(acces_denied_err)
    })

    it('Worker accepted job from status WaitWorker: success', async function() {
        const {
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            service,
            priceOracle,
            wusd_token,
            pension_fund,
            referral,
            work_quest_factory,
            work_quest,
        } = await loadFixture(deployWithFixture)

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

    it('Worker accepted job from not WaitWorker status: fail', async function () {
        const { employer, worker, arbiter, work_quest } = await loadFixture(
            deployWithFixture
        )

        await expect(work_quest.connect(worker).acceptJob()).revertedWith(
            acces_denied_err
        )

        await work_quest.connect(employer).assignJob(worker.address)
        await work_quest.connect(worker).acceptJob()
        await expect(work_quest.connect(worker).acceptJob()).revertedWith(
            acces_denied_err
        )

        await work_quest.connect(worker).verificationJob()
        await expect(work_quest.connect(worker).acceptJob()).revertedWith(
            acces_denied_err
        )

        await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE })
        await expect(work_quest.connect(worker).acceptJob()).revertedWith(
            acces_denied_err
        )

        await work_quest.connect(arbiter).arbitrationAcceptWork()
        await expect(work_quest.connect(worker).acceptJob()).revertedWith(
            acces_denied_err
        )
    })

    describe('Job verification', () => {
        it('Set verification status: success', async function () {
            const { employer, worker, work_quest_factory, work_quest } =
                await loadFixture(deployWithFixture)

            await work_quest.connect(employer).assignJob(worker.address)
            await work_quest.connect(worker).acceptJob()
            await work_quest.connect(worker).verificationJob()
            const questInfo = await work_quest.connect(employer).getInfo()
            expect(questInfo._jobHash).to.eq(job_hash)
            expect(questInfo._cost).to.eq(cost)
            expect(questInfo._employer).to.eq(employer.address)
            expect(questInfo._worker).to.eq(worker.address)
            expect(questInfo._factory).to.eq(work_quest_factory.address)
            expect(questInfo._status).to.eq(JobStatus.WaitJobVerify)
            expect(questInfo._deadline).to.eq(deadline)
        })

        it('Job status set Verificatiion by not worker: fail', async function () {
            const { employer, worker, work_quest } = await loadFixture(
                deployWithFixture
            )

            //Process job
            await work_quest.connect(employer).assignJob(worker.address)
            await work_quest.connect(worker).acceptJob()
            await expect(
                work_quest.connect(employer).verificationJob()
            ).revertedWith(acces_denied_err)
        })

        it('Job status set Verificatiion from non InProgress status: fail', async function () {
            const {
                work_quest_owner,
                employer,
                worker,
                arbiter,
                feeReceiver,
                affiliat,
                service,
                priceOracle,
                wusd_token,
                pension_fund,
                referral,
                work_quest_factory,
                work_quest,
            } = await loadFixture(deployWithFixture)

            await expect(
                work_quest.connect(worker).verificationJob()
            ).revertedWith(acces_denied_err)

            await work_quest.connect(employer).assignJob(worker.address)
            await expect(
                work_quest.connect(worker).verificationJob()
            ).revertedWith(acces_denied_err)

            await work_quest.connect(worker).acceptJob()
            await work_quest.connect(worker).verificationJob()
            await work_quest
                .connect(employer)
                .arbitration({ value: WORKQUEST_FEE })
            await expect(
                work_quest.connect(worker).verificationJob()
            ).revertedWith(acces_denied_err)

            work_quest.connect(arbiter).arbitrationAcceptWork()
            await expect(
                work_quest.connect(worker).verificationJob()
            ).revertedWith(acces_denied_err)
        })
    })

    describe('Arbitration job', function(){
        it('Set job to arbitration: success', async function () {
            const {
                work_quest_owner,
                employer,
                worker,
                arbiter,
                feeReceiver,
                affiliat,
                service,
                priceOracle,
                wusd_token,
                pension_fund,
                referral,
                work_quest_factory,
                work_quest,
            } = await loadFixture(deployWithFixture)

            await work_quest.connect(employer).assignJob(worker.address)
            await work_quest.connect(worker).acceptJob()
            await work_quest.connect(worker).verificationJob()
            await work_quest
                .connect(employer)
                .arbitration({ value: WORKQUEST_FEE })
            const questInfo = await work_quest.connect(employer).getInfo()
            expect(questInfo._jobHash).to.eq(job_hash)
            expect(questInfo._cost).to.eq(cost)
            expect(questInfo._employer).to.eq(employer.address)
            expect(questInfo._worker).to.eq(worker.address)
            expect(questInfo._factory).to.eq(work_quest_factory.address)
            expect(questInfo._status).to.eq(JobStatus.Arbitration)
            expect(questInfo._deadline).to.eq(deadline)
        })

        it('Set job to arbitration from not WaitJobVerify status by employer: fail', async function () {
            const { work_quest_owner, employer, worker, arbiter, work_quest } =
                await loadFixture(deployWithFixture)

            await expect(
                work_quest
                    .connect(employer)
                    .arbitration({ value: WORKQUEST_FEE })
            ).revertedWith(acces_denied_err)

            await work_quest.connect(employer).assignJob(worker.address)
            await expect(
                work_quest
                    .connect(employer)
                    .arbitration({ value: WORKQUEST_FEE })
            ).revertedWith(acces_denied_err)

            await work_quest.connect(worker).acceptJob()
            await expect(
                work_quest
                    .connect(employer)
                    .arbitration({ value: WORKQUEST_FEE })
            ).revertedWith(acces_denied_err)

            await work_quest.connect(worker).verificationJob()
            await work_quest
                .connect(employer)
                .arbitration({ value: WORKQUEST_FEE })
            await expect(
                work_quest
                    .connect(employer)
                    .arbitration({ value: WORKQUEST_FEE })
            ).revertedWith(acces_denied_err)

            await work_quest.connect(arbiter).arbitrationAcceptWork()
            await expect(
                work_quest
                    .connect(employer)
                    .arbitration({ value: WORKQUEST_FEE })
            ).revertedWith(acces_denied_err)
        })
    })

    describe('Rework job', function() {
        it('Set job to rework: success', async function () {
            const {
                work_quest_owner,
                employer,
                worker,
                arbiter,
                feeReceiver,
                affiliat,
                service,
                priceOracle,
                wusd_token,
                pension_fund,
                referral,
                work_quest_factory,
                work_quest,
            } = await loadFixture(deployWithFixture)

            await work_quest.connect(employer).assignJob(worker.address)
            await work_quest.connect(worker).acceptJob()
            await work_quest.connect(worker).verificationJob()
            await work_quest
                .connect(employer)
                .arbitration({ value: WORKQUEST_FEE })
            await work_quest.connect(arbiter).arbitrationRework()

            const questInfo = await work_quest.connect(employer).getInfo()
            expect(questInfo._jobHash).to.eq(job_hash)
            expect(questInfo._cost).to.eq(cost)
            expect(questInfo._employer).to.eq(employer.address)
            expect(questInfo._worker).to.eq(worker.address)
            expect(questInfo._factory).to.eq(work_quest_factory.address)
            expect(questInfo._status).to.eq(JobStatus.InProgress)
        })

        it('Rework from not Arbitration status: fail', async function() {
            const {
                work_quest_owner,
                employer,
                worker,
                arbiter,
                feeReceiver,
                affiliat,
                service,
                priceOracle,
                wusd_token,
                pension_fund,
                referral,
                work_quest_factory,
                work_quest,
            } = await loadFixture(deployWithFixture)

            await expect(
                work_quest.connect(arbiter).arbitrationRework()
            ).revertedWith(acces_denied_err)

            await work_quest.connect(employer).assignJob(worker.address)
            await expect(
                work_quest.connect(arbiter).arbitrationRework()
            ).revertedWith(acces_denied_err)

            await work_quest.connect(worker).acceptJob()
            await expect(
                work_quest.connect(arbiter).arbitrationRework()
            ).revertedWith(acces_denied_err)

            await work_quest.connect(worker).verificationJob()
            await expect(
                work_quest.connect(arbiter).arbitrationRework()
            ).revertedWith(acces_denied_err)

            await work_quest
                .connect(employer)
                .arbitration({ value: WORKQUEST_FEE })
            await work_quest.connect(arbiter).arbitrationAcceptWork()

            await expect(
                work_quest.connect(arbiter).arbitrationRework()
            ).revertedWith(acces_denied_err)
        })

        describe('Accept job', function(){
            it('Accept job by employer: success', async function(){
                const {
                    work_quest_owner,
                    employer,
                    worker,
                    arbiter,
                    feeReceiver,
                    affiliat,
                    service,
                    priceOracle,
                    wusd_token,
                    pension_fund,
                    referral,
                    work_quest_factory,
                    work_quest,
                } = await loadFixture(deployWithFixture)

                await work_quest.connect(employer).assignJob(worker.address);
                await work_quest.connect(worker).acceptJob();
                await work_quest.connect(worker).verificationJob();
                const questInfo = await work_quest.connect(employer).getInfo()
                expect(questInfo._jobHash).to.eq(job_hash)
                expect(questInfo._cost).to.eq(cost)
                expect(questInfo._employer).to.eq(employer.address)
                expect(questInfo._worker).to.eq(worker.address)
                expect(questInfo._factory).to.eq(work_quest_factory.address)
                expect(questInfo._status).to.eq(JobStatus.WaitJobVerify)
                expect(await wusd_token.balanceOf(work_quest.address)).to.be.equal(cost);

                const feeReceiverBefore = BigInt(await wusd_token.balanceOf(feeReceiver.address));
                const workerBefore = BigInt(await wusd_token.balanceOf(worker.address));
                await work_quest.connect(employer).acceptJobResult();
                const feeReceiverAfter = BigInt(await wusd_token.balanceOf(feeReceiver.address));
                const workerAfter = BigInt(await wusd_token.balanceOf(worker.address));
                expect(feeReceiverAfter - feeReceiverBefore).to.eq(comission); // 10000000000000000
                expect(workerAfter - workerBefore).to.eq(reward);
                expect(await wusd_token.balanceOf(work_quest.address)).to.be.equal(0);
                let info = await work_quest.connect(employer).getInfo();
                expect(info._status).to.eq(JobStatus.Finished);
            });
    
            it('Accept job by arbiter: success', async function(){
                const {
                    work_quest_owner,
                    employer,
                    worker,
                    arbiter,
                    feeReceiver,
                    affiliat,
                    service,
                    priceOracle,
                    wusd_token,
                    pension_fund,
                    referral,
                    work_quest_factory,
                    work_quest,
                } = await loadFixture(deployWithFixture)

                await work_quest.connect(employer).assignJob(worker.address);
                await work_quest.connect(worker).acceptJob();
                await work_quest.connect(worker).verificationJob();
                await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
                let feeReceiverBefore = BigInt(await wusd_token.balanceOf(feeReceiver.address));
                let workerBefore = BigInt(await wusd_token.balanceOf(worker.address));
                await work_quest.connect(arbiter).arbitrationAcceptWork();
                let feeReceiverAfter = BigInt(await wusd_token.balanceOf(feeReceiver.address));
                let workerAfter = BigInt(await wusd_token.balanceOf(worker.address));
                expect(feeReceiverAfter - feeReceiverBefore).to.eq(comission);
                expect(workerAfter - workerBefore).to.eq(reward);
                expect(await wusd_token.balanceOf(work_quest.address)).to.eq(0);
                let info = await work_quest.connect(employer).getInfo();
                expect(info._status).to.be.equal(JobStatus.Finished);
            });
    
            it('Accept job result from not WaitJobVerify status by employer: fail', async function(){
                const {
                    work_quest_owner,
                    employer,
                    worker,
                    arbiter,
                    feeReceiver,
                    affiliat,
                    service,
                    priceOracle,
                    wusd_token,
                    pension_fund,
                    referral,
                    work_quest_factory,
                    work_quest,
                } = await loadFixture(deployWithFixture)

                await expect(
                    work_quest.connect(employer).acceptJobResult()
                ).revertedWith(acces_denied_err);
                await work_quest.connect(employer).assignJob(worker.address);
                await expect(
                    work_quest.connect(employer).acceptJobResult()
                ).revertedWith(acces_denied_err);
                await work_quest.connect(worker).acceptJob();
                await expect(
                    work_quest.connect(employer).acceptJobResult()
                ).revertedWith(acces_denied_err);
                await work_quest.connect(worker).verificationJob();
                await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
                await expect(
                    work_quest.connect(employer).acceptJobResult()
                ).revertedWith(acces_denied_err);
                await work_quest.connect(arbiter).arbitrationAcceptWork()
                await expect(
                    work_quest.connect(employer).acceptJobResult()
                ).revertedWith(acces_denied_err);
            });
    
            it('Accept job from not Arbitration status by arbiter: fail', async function(){
                const {
                    work_quest_owner,
                    employer,
                    worker,
                    arbiter,
                    work_quest,
                } = await loadFixture(deployWithFixture)

                await expect(
                    work_quest.connect(arbiter).arbitrationAcceptWork()
                ).revertedWith(acces_denied_err);

                await work_quest.connect(employer).assignJob(worker.address);
                await expect(
                    work_quest.connect(arbiter).arbitrationAcceptWork()
                ).revertedWith(acces_denied_err);
                await work_quest.connect(worker).acceptJob();
                await expect(
                    work_quest.connect(arbiter).arbitrationAcceptWork()
                ).revertedWith(acces_denied_err);
                await work_quest.connect(worker).verificationJob();
                await expect(
                    work_quest.connect(arbiter).arbitrationAcceptWork()
                ).revertedWith(acces_denied_err);
                await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
                await work_quest.connect(arbiter).arbitrationAcceptWork()
                await expect(
                    work_quest.connect(arbiter).arbitrationAcceptWork()
                ).revertedWith(acces_denied_err);
            });
        });

        describe('Reject job', function(){
            it('Reject job by arbiter: success', async function(){

                const {
                    work_quest_owner,
                    employer,
                    worker,
                    arbiter,
                    feeReceiver,
                    affiliat,
                    service,
                    priceOracle,
                    wusd_token,
                    pension_fund,
                    referral,
                    work_quest_factory,
                    work_quest,
                } = await loadFixture(deployWithFixture)

                await work_quest.connect(employer).assignJob(worker.address);
                await work_quest.connect(worker).acceptJob();
                await work_quest.connect(worker).verificationJob();
                await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
                const feeReceiver_before = BigInt(await wusd_token.balanceOf(feeReceiver.address));
                const employer_before = BigInt(await wusd_token.balanceOf(employer.address));
                await work_quest.connect(arbiter).arbitrationRejectWork();
                const feeReceiver_after = BigInt(await wusd_token.balanceOf(feeReceiver.address));
                const employer_after = BigInt(await wusd_token.balanceOf(employer.address));
                expect(employer_after - employer_before).to.eq(reward);
                expect(feeReceiver_after - feeReceiver_before).to.eq(comission);
                const questInfo = await work_quest.connect(employer).getInfo()
                expect(questInfo._jobHash).to.eq(job_hash)
                expect(questInfo._cost).to.eq(cost)
                expect(questInfo._employer).to.eq(employer.address)
                expect(questInfo._worker).to.eq(worker.address)
                expect(questInfo._factory).to.eq(work_quest_factory.address)
                expect(questInfo._status).to.eq(JobStatus.Finished)
            });

            it('Reject work from non Arbitration status: fail', async function(){
                const {
                    work_quest_owner,
                    employer,
                    worker,
                    arbiter,
                    feeReceiver,
                    affiliat,
                    service,
                    priceOracle,
                    wusd_token,
                    pension_fund,
                    referral,
                    work_quest_factory,
                    work_quest,
                } = await loadFixture(deployWithFixture)


                await expect(
                    work_quest.connect(arbiter).arbitrationRejectWork()
                ).revertedWith(acces_denied_err);
                await work_quest.connect(employer).assignJob(worker.address);
                await expect(
                    work_quest.connect(arbiter).arbitrationRejectWork()
                ).revertedWith(acces_denied_err);
                await work_quest.connect(worker).acceptJob();
                await expect(
                    work_quest.connect(arbiter).arbitrationRejectWork()
                ).revertedWith(acces_denied_err);
                await work_quest.connect(worker).verificationJob();
                await expect(
                    work_quest.connect(arbiter).arbitrationRejectWork()
                ).revertedWith(acces_denied_err);
                await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
                await work_quest.connect(arbiter).arbitrationRejectWork()
                await expect(
                    work_quest.connect(arbiter).arbitrationRejectWork()
                ).revertedWith(acces_denied_err);
            });
        });
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
