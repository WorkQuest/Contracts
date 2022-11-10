const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'))
const { expect } = require('chai')
const { ethers } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });


const nullstr = '0x0000000000000000000000000000000000000000';
const job_hash = web3.utils.keccak256('JOBHASH');
const cost = parseEther('1');
const comission = parseEther('0.01');
const cost_comission = parseEther('1.01');
const reward = parseEther('0.99');
const forfeit = parseEther('0.1');
const reward_after_forfeit = parseEther('0.891');
const acces_denied_err = 'WorkQuest: Access denied or invalid status';
const WORKQUEST_FEE = '10000000000000000';
const PENSION_LOCK_TIME = '60';
const PENSION_DEFAULT_FEE = '10000000000000000';
const PENSION_FEE_PER_MONTH = "1200000000000000";
const PENSION_FEE_WITHDRAW = "5000000000000000";
const VALID_TIME = "600";
const PRICE = parseEther("228");
const SYMBOL = "WQT";
const twentyBucksInWQT = (20 / 228).toFixed(18); // TODO 228 is fixed value that oracle returns now
//      if price is asked

const JobStatus = Object.freeze({
    New: 0,
    Published: 1,
    WaitWorker: 2,
    InProgress: 3,
    WaitJobVerify: 4,
    Arbitration: 5,
    Finished: 6,
})

let work_quest_owner;
let employer;
let worker;
let arbiter;
let feeReceiver;
let work_quest_factory;
let work_quest;
let affiliat;
let referral;
let priceOracle;
let wusd_token;
let pension_fund;

describe('Work Quest test', () => {
    // let call_flow;
    const twentyWQT = parseEther('20');
    const totalSupplyOfWQToken = parseEther('100000000');
    const zero = parseEther('0');
    const dateNow = Math.floor(Date.now / 1000);
    let deadline = '9999999999';
    let oneK = parseEther('1000');
    let referalBonus = parseEther(twentyBucksInWQT.toString());

    beforeEach(async () => {
        require('dotenv').config();
        [
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            validator
        ] = await ethers.getSigners();

        const BridgeToken = await ethers.getContractFactory('WQBridgeToken');
        wusd_token = await upgrades.deployProxy(BridgeToken, ["WUSD stablecoin", "WUSD", 18], { initializer: 'initialize', kind: 'transparent' });
        await wusd_token.deployed();
        await wusd_token.grantRole(await wusd_token.MINTER_ROLE(), work_quest_owner.address);
        await wusd_token.mint(employer.address, oneK);

        const PensionFund = await hre.ethers.getContractFactory('WQPensionFund');
        pension_fund = await upgrades.deployProxy(
            PensionFund,
            [
                PENSION_LOCK_TIME,
                PENSION_DEFAULT_FEE,
                wusd_token.address,
                feeReceiver.address,
                PENSION_FEE_PER_MONTH,
                PENSION_FEE_WITHDRAW
            ],
            { initializer: 'initialize', kind: 'transparent' }
        );
        await pension_fund.deployed();

        const PriceOracle = await hre.ethers.getContractFactory('WQPriceOracle');
        priceOracle = await upgrades.deployProxy(PriceOracle, [validator.address, VALID_TIME], { initializer: 'initialize', kind: 'transparent' });
        await priceOracle.deployed();
        await priceOracle.updateToken(1, SYMBOL);
        let nonce = "1";
        let message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: PRICE.toString() },
            { t: 'string', v: SYMBOL }
        );
        let signature = await web3.eth.sign(message, validator.address);
        let sig = ethers.utils.splitSignature(signature);
        await priceOracle.connect(worker).setTokenPricesUSD(nonce, sig.v, sig.r, sig.s, PRICE, "2000000000000000000", SYMBOL);

        const WQReferralContract = await hre.ethers.getContractFactory('WQReferral');
        referral = await upgrades.deployProxy(
            WQReferralContract,
            [
                priceOracle.address,
                validator.address,
                twentyWQT,
                parseEther("1000")
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await referral.deployed();
        await referral.grantRole(await referral.SERVICE_ROLE(), validator.address);

        const WorkQuestFactory = await hre.ethers.getContractFactory('WorkQuestFactory');
        work_quest_factory = await upgrades.deployProxy(WorkQuestFactory,
            [
                WORKQUEST_FEE,
                WORKQUEST_FEE,
                WORKQUEST_FEE,
                feeReceiver.address,
                pension_fund.address,
                referral.address,
                wusd_token.address
            ], { initializer: 'initialize', kind: 'transparent' });
        await work_quest_factory.deployed();
        await referral.setFactory(work_quest_factory.address);

        await work_quest_factory.grantRole(await work_quest_factory.ARBITER_ROLE(), arbiter.address);

        await wusd_token.connect(employer).approve(work_quest_factory.address, cost_comission);
        await work_quest_factory.connect(employer).newWorkQuest(job_hash, cost, deadline, 1);

        let work_quest_address = (await work_quest_factory.getWorkQuests(employer.address, 0, 1))[0];
        work_quest = await hre.ethers.getContractAt('WorkQuest', work_quest_address);
        await work_quest.deployed();
    })

    describe('Deployment', () => {
        it('Should set the admin roles to creator and fee', async () => {
            var default_admin_role = await work_quest_factory.DEFAULT_ADMIN_ROLE();
            var admin_role = await work_quest_factory.ADMIN_ROLE();
            var arbiter_role = await work_quest_factory.ARBITER_ROLE();
            expect(
                await work_quest_factory
                    .hasRole(default_admin_role, work_quest_owner.address)
            ).to.equal(true);
            expect(
                await work_quest_factory
                    .hasRole(admin_role, work_quest_owner.address)
            ).to.equal(true);
            expect(
                await work_quest_factory
                    .hasRole(arbiter_role, arbiter.address)
            ).to.equal(true);
            expect(
                await work_quest_factory.connect(work_quest_owner).feeWorker()
            ).to.equal(WORKQUEST_FEE);
            expect(
                await work_quest_factory.connect(work_quest_owner).feeEmployer()
            ).to.equal(WORKQUEST_FEE);
            expect(
                await work_quest_factory.connect(work_quest_owner).feeReceiver()
            ).to.equal(feeReceiver.address);
        });
    });

    describe('New job', () => {
        it('Create new job: success', async () => {
            expect(await work_quest_factory.pensionFund()).to.be.equal(pension_fund.address);
            expect(await work_quest_factory.feeEmployer()).to.equal(WORKQUEST_FEE);
            expect(await work_quest_factory.feeWorker()).to.equal(WORKQUEST_FEE);
            expect(await work_quest_factory.feeTx()).to.equal(WORKQUEST_FEE);
            expect(await work_quest_factory.feeReceiver()).to.equal(feeReceiver.address);
            expect(await work_quest_factory.referral()).to.be.equal(referral.address);
            expect(await work_quest_factory.wusd()).to.equal(wusd_token.address);

            expect(await work_quest.factory()).to.be.equal(work_quest_factory.address);

            let info = await work_quest.connect(employer).getInfo();
            expect(info[0]).to.be.equal(job_hash);
            expect(info[1]).to.be.equal(cost);
            expect(info[2]).to.be.equal(zero);
            expect(info[3]).to.be.equal(employer.address);
            expect(info[4]).to.be.equal(nullstr);
            expect(info[5]).to.be.equal(work_quest_factory.address);
            expect(info[6]).to.be.equal(JobStatus.Published);
            expect(info[7]).to.be.equal(deadline);

        });
    });

    describe('Publish job', () => {
        it('Publish job: success', async () => {
            let info = await work_quest.connect(employer).getInfo();
            expect(info[6]).to.be.equal(JobStatus.Published);
        });
    });

    describe('Assign worker to job', () => {
        it('Assigning job: success', async () => {
            await work_quest.connect(employer).assignJob(worker.address);
            let info = await work_quest.connect(employer).getInfo()
            expect(info[0]).to.be.equal(job_hash)
            expect(info[1]).to.be.equal(cost)
            expect(info[2]).to.be.equal(zero)
            expect(info[3]).to.be.equal(employer.address)
            expect(info[4]).to.be.equal(worker.address)
            expect(info[6]).to.be.equal(JobStatus.WaitWorker)
        });

        it('Assigning worker to job from not employer: fail', async () => {
            await expect(
                work_quest.connect(worker).assignJob(worker.address)
            ).revertedWith(acces_denied_err);
        });

        it('Assigning invalid worker: fail', async () => {
            await expect(
                work_quest.connect(employer).assignJob(nullstr)
            ).revertedWith("WorkQuest: Invalid address");
        });

        it('Assign job from non Public statuses: fail', async () => {
            await work_quest.connect(employer).assignJob(worker.address);

            await work_quest.connect(worker).acceptJob();
            await expect(
                work_quest.connect(employer).assignJob(worker.address)
            ).revertedWith(acces_denied_err);

            await work_quest.connect(worker).verificationJob();
            await expect(
                work_quest.connect(employer).assignJob(worker.address)
            ).revertedWith(acces_denied_err);

            await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
            await expect(
                work_quest.connect(employer).assignJob(worker.address)
            ).revertedWith(acces_denied_err);

            await work_quest.connect(arbiter).arbitrationAcceptWork();
            await expect(
                work_quest.connect(employer).assignJob(worker.address)
            ).revertedWith(acces_denied_err);
        });
    });

    describe('Worker accepted job', () => {
        it('Worker accepted job from status WaitWorker: success', async () => {
            await work_quest.connect(employer).assignJob(worker.address);
            await work_quest.connect(worker).acceptJob();
            let info = await work_quest.connect(employer).getInfo();
            expect(info[0]).to.be.equal(job_hash);
            expect(info[1]).to.be.equal(cost);
            expect(info[2]).to.be.equal(0);
            expect(info[3]).to.be.equal(employer.address);
            expect(info[4]).to.be.equal(worker.address);
            expect(info[6]).to.be.equal(JobStatus.InProgress);
        });

        it('Worker accepted job from not WaitWorker status: fail', async () => {
            await expect(
                work_quest.connect(worker).acceptJob()
            ).revertedWith(acces_denied_err);

            await work_quest.connect(employer).assignJob(worker.address);
            await work_quest.connect(worker).acceptJob();
            await expect(
                work_quest.connect(worker).acceptJob()
            ).revertedWith(acces_denied_err);

            await work_quest.connect(worker).verificationJob();
            await expect(
                work_quest.connect(worker).acceptJob()
            ).revertedWith(acces_denied_err);

            await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
            await expect(
                work_quest.connect(worker).acceptJob()
            ).revertedWith(acces_denied_err);

            await work_quest.connect(arbiter).arbitrationAcceptWork();
            await expect(
                work_quest.connect(worker).acceptJob()
            ).revertedWith(acces_denied_err);
        });
    });

    describe('Job verification', () => {
        it('Set verification status: success', async () => {
            await work_quest.connect(employer).assignJob(worker.address);
            await work_quest.connect(worker).acceptJob();
            await work_quest.connect(worker).verificationJob();
            let info = await work_quest.connect(employer).getInfo()
            expect(info[0]).to.be.equal(job_hash)
            expect(info[1]).to.be.equal(cost)
            expect(info[2]).to.be.equal(0)
            expect(info[3]).to.be.equal(employer.address)
            expect(info[4]).to.be.equal(worker.address)
            expect(info[5]).to.be.equal(work_quest_factory.address)
            expect(info[6]).to.be.equal(JobStatus.WaitJobVerify)
        });

        it('Job status set Verificatiion by not worker: fail', async () => {
            //Process job
            await work_quest.connect(employer).assignJob(worker.address);
            await work_quest.connect(worker).acceptJob();
            await expect(
                work_quest.connect(employer).verificationJob()
            ).revertedWith(acces_denied_err);
        });

        it('Job status set Verificatiion from non InProgress status: fail', async () => {
            await expect(
                work_quest.connect(worker).verificationJob()
            ).revertedWith(acces_denied_err);
            await work_quest.connect(employer).assignJob(worker.address);
            await expect(
                work_quest.connect(worker).verificationJob()
            ).revertedWith(acces_denied_err);
            await work_quest.connect(worker).acceptJob();
            await work_quest.connect(worker).verificationJob();
            await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
            await expect(
                work_quest.connect(worker).verificationJob()
            ).revertedWith(acces_denied_err);
            work_quest.connect(arbiter).arbitrationAcceptWork();
            await expect(
                work_quest.connect(worker).verificationJob()
            ).revertedWith(acces_denied_err);
        });
    });
    describe('Arbitration job', () => {
        it('Set job to arbitration: success', async () => {
            await work_quest.connect(employer).assignJob(worker.address);
            await work_quest.connect(worker).acceptJob();
            await work_quest.connect(worker).verificationJob();
            await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
            let info = await work_quest.connect(employer).getInfo();
            expect(info[0]).to.be.equal(job_hash);
            expect(info[1]).to.be.equal(cost);
            expect(info[2]).to.be.equal(0);
            expect(info[3]).to.be.equal(employer.address);
            expect(info[4]).to.be.equal(worker.address);
            expect(info[5]).to.be.equal(work_quest_factory.address);
            expect(info[6]).to.be.equal(JobStatus.Arbitration);
        });

        it('Set job to arbitration from not WaitJobVerify status by employer: fail', async () => {
            await expect(
                work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE })
            ).revertedWith(acces_denied_err);
            await work_quest.connect(employer).assignJob(worker.address);
            await expect(
                work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE })
            ).revertedWith(acces_denied_err);
            await work_quest.connect(worker).acceptJob();
            await expect(
                work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE })
            ).revertedWith(acces_denied_err);
            await work_quest.connect(worker).verificationJob();
            await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
            await expect(
                work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE })
            ).revertedWith(acces_denied_err);
            await work_quest.connect(arbiter).arbitrationAcceptWork();
            await expect(
                work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE })
            ).revertedWith(acces_denied_err);
        });
    });

    describe('Rework job', () => {
        it('Set job to rework: success', async () => {
            await work_quest.connect(employer).assignJob(worker.address);
            await work_quest.connect(worker).acceptJob();
            await work_quest.connect(worker).verificationJob();
            await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
            await work_quest.connect(arbiter).arbitrationRework()
            let info = await work_quest.connect(employer).getInfo()
            expect(info[0]).to.be.equal(job_hash)
            expect(info[1]).to.be.equal(cost)
            expect(info[2]).to.be.equal(0)
            expect(info[3]).to.be.equal(employer.address)
            expect(info[4]).to.be.equal(worker.address)
            expect(info[5]).to.be.equal(work_quest_factory.address)
            expect(info[6]).to.be.equal(JobStatus.InProgress)
        });

        it('Rework from not Arbitration status: fail', async () => {
            await expect(
                work_quest.connect(arbiter).arbitrationRework()
            ).revertedWith(acces_denied_err);
            await work_quest.connect(employer).assignJob(worker.address);
            await expect(
                work_quest.connect(arbiter).arbitrationRework()
            ).revertedWith(acces_denied_err);
            await work_quest.connect(worker).acceptJob();
            await expect(
                work_quest.connect(arbiter).arbitrationRework()
            ).revertedWith(acces_denied_err);
            await work_quest.connect(worker).verificationJob();
            await expect(
                work_quest.connect(arbiter).arbitrationRework()
            ).revertedWith(acces_denied_err);
            await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
            await work_quest.connect(arbiter).arbitrationAcceptWork()
            await expect(
                work_quest.connect(arbiter).arbitrationRework()
            ).revertedWith(acces_denied_err);
        });
    });

    describe('Accept job', () => {
        it('Accept job by employer: success', async () => {
            await work_quest.connect(employer).assignJob(worker.address);
            await work_quest.connect(worker).acceptJob();
            await work_quest.connect(worker).verificationJob();
            expect(await wusd_token.balanceOf(work_quest.address)).to.be.equal(cost);
            let feeReceiverBefore = BigInt(await wusd_token.balanceOf(feeReceiver.address));
            let workerBefore = BigInt(await wusd_token.balanceOf(worker.address));
            await work_quest.connect(employer).acceptJobResult();
            let feeReceiverAfter = BigInt(await wusd_token.balanceOf(feeReceiver.address));
            let workerAfter = BigInt(await wusd_token.balanceOf(worker.address));
            expect(feeReceiverAfter - feeReceiverBefore).to.be.equal(comission);
            expect(workerAfter - workerBefore).to.be.equal(reward);
            expect(await wusd_token.balanceOf(work_quest.address)).to.be.equal(0);
            let info = await work_quest.connect(employer).getInfo();
            expect(info[6]).to.be.equal(JobStatus.Finished);
        });

        it('Accept job by arbiter: success', async () => {
            await work_quest.connect(employer).assignJob(worker.address);
            await work_quest.connect(worker).acceptJob();
            await work_quest.connect(worker).verificationJob();
            await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
            let feeReceiverBefore = BigInt(await wusd_token.balanceOf(feeReceiver.address));
            let workerBefore = BigInt(await wusd_token.balanceOf(worker.address));
            await work_quest.connect(arbiter).arbitrationAcceptWork();
            let feeReceiverAfter = BigInt(await wusd_token.balanceOf(feeReceiver.address));
            let workerAfter = BigInt(await wusd_token.balanceOf(worker.address));
            expect(feeReceiverAfter - feeReceiverBefore).to.be.equal(comission);
            expect(workerAfter - workerBefore).to.be.equal(reward);
            expect(await wusd_token.balanceOf(work_quest.address)).to.be.equal(0);
            let info = await work_quest.connect(employer).getInfo();
            expect(info[6]).to.be.equal(JobStatus.Finished);
        });

        it('Accept job result from not WaitJobVerify status by employer: fail', async () => {
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

        it('Accept job from not Arbitration status by arbiter: fail', async () => {
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

    describe('Reject job', () => {
        it('Reject job by arbiter: success', async () => {
            await work_quest.connect(employer).assignJob(worker.address);
            await work_quest.connect(worker).acceptJob();
            await work_quest.connect(worker).verificationJob();
            await work_quest.connect(employer).arbitration({ value: WORKQUEST_FEE });
            let feeReceiver_before = BigInt(await wusd_token.balanceOf(feeReceiver.address));
            let employer_before = BigInt(await wusd_token.balanceOf(employer.address));
            await work_quest.connect(arbiter).arbitrationRejectWork();
            let feeReceiver_after = BigInt(await wusd_token.balanceOf(feeReceiver.address));
            let employer_after = BigInt(await wusd_token.balanceOf(employer.address));
            expect(employer_after - employer_before).equal(reward);
            expect(feeReceiver_after - feeReceiver_before).equal(comission);
            let info = await work_quest.connect(employer).getInfo();
            expect(info[0]).to.be.equal(job_hash);
            expect(info[1]).to.be.equal(cost);
            expect(info[2]).to.be.equal(0);
            expect(info[3]).to.be.equal(employer.address);
            expect(info[4]).to.be.equal(worker.address);
            expect(info[5]).to.be.equal(work_quest_factory.address);
            expect(info[6]).to.be.equal(JobStatus.Finished);
        });
        it('Reject work from non Arbitration status: fail', async () => {
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



});
