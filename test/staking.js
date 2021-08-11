const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });
const Web3 = require('web3');
const { parseEther } = require("ethers/lib/utils");
const web3 = new Web3(hre.network.provider);
const rewardDelta1 = parseEther("76000");
const rewardDelta2 = parseEther("1056800");
const distributionTime = 2678400; //31 day
const stakePeriod = 86400;
const claimPeriod = 86400;
const minStake = parseEther("100");
const maxStake = parseEther("100000");

describe("Staking tests", () => {
    let staking;
    let token;
    let staking_deploy_block;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        const WQToken = await ethers.getContractFactory('WQToken');
        token = await upgrades.deployProxy(WQToken, [parseEther("100000000")], { initializer: 'initialize' });
        let bl_num = await hre.ethers.provider.send("eth_blockNumber", []);
        staking_deploy_block = await hre.ethers.provider.send("eth_getBlockByNumber", [bl_num, false]);
        await token.transfer(accounts[1].address, parseEther("500000"));
        await token.transfer(accounts[2].address, parseEther("500000"));
        await token.transfer(accounts[3].address, parseEther("500000"));
        const Staking = await ethers.getContractFactory("WQStaking");
        staking = await upgrades.deployProxy(Staking, [parseInt(staking_deploy_block.timestamp), rewardDelta1, rewardDelta2, distributionTime, stakePeriod, claimPeriod, minStake, maxStake, token.address, token.address], { initializer: 'initialize' });
    });

    describe("Staking deploy", () => {
        it("STEP1: should be set all variables", async () => {
            let staking_info = await staking.getStakingInfo();
            expect(
                staking_info.startTime
            ).to.to.equal(parseInt(staking_deploy_block.timestamp));
            expect(
                staking_info.rewardDelta1
            ).to.to.equal(rewardDelta1);
            expect(
                staking_info.rewardDelta2
            ).to.to.equal(rewardDelta2);
            expect(
                staking_info.distributionTime
            ).to.to.equal(distributionTime);
            expect(
                staking_info.stakePeriod
            ).to.to.equal(stakePeriod);
            expect(
                staking_info.claimPeriod
            ).to.to.equal(claimPeriod);
            expect(
                staking_info.minStake
            ).to.to.equal(minStake);
            expect(
                staking_info.maxStake
            ).to.to.equal(maxStake);
            expect(
                staking_info.totalStaked
            ).to.to.equal(0);
            expect(
                staking_info.totalDistributed
            ).to.to.equal(0);
            expect(
                staking_info.stakeTokenAddress
            ).to.to.equal(token.address);
            expect(
                staking_info.rewardTokenAddress
            ).to.to.equal(token.address);
        });
    });

    describe("Stake", () => {
        it("STEP1: stake: success", async () => {
            await token.connect(accounts[1]).approve(staking.address, minStake);
            await staking.connect(accounts[1]).stake(minStake);
            let bl_num = await hre.ethers.provider.send("eth_blockNumber", []);
            let cur_block = await hre.ethers.provider.send("eth_getBlockByNumber", [bl_num, false]);
            let block_time = parseInt(cur_block.timestamp);
            let user_info = await staking.stakes(accounts[1].address);
            expect(
                user_info.amount
            ).to.equal(minStake);
            // expect(
            //     user_info.rewardDebt
            // ).to.equal( );
            expect(
                user_info.distributed
            ).to.equal(0);
            expect(
                user_info.stakedAt
            ).to.equal(block_time);
            expect(
                user_info.claimedAt
            ).to.equal(0);
            expect(
                user_info.unstakeTime
            ).to.equal(block_time + duration);
            expect(
                await staking.totalStaked()
            ).to.equal(minStake);
            // expect(
            //     await staking.tokensPerStake()
            // ).to.equal();
            // expect(
            //     await staking.rewardProduced()
            // ).to.equal();


        });
        it("STEP2: stake less than minimum: fail", async () => {
            await token.connect(accounts[1]).approve(staking.address, parseEther("99"));
            try {
                await staking.connect(accounts[1]).stake(parseEther("99"));
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQStaking: Amount should be greater than minimum stake");
            }
        });
        it("STEP3: stake greater than maximum: fail", async () => {
            await token.connect(accounts[1]).approve(staking.address, parseEther("100001"));
            try {
                await staking.connect(accounts[1]).stake(parseEther("100001"));
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQStaking: Amount should be less than maximum stake");
            }
        });
        it("STEP4: stake more often than a stake period: fail", async () => {
            await token.connect(accounts[1]).approve(staking.address, minStake);
            await staking.connect(accounts[1]).stake(minStake);
            await token.connect(accounts[1]).approve(staking.address, minStake);
            try {
                await staking.connect(accounts[1]).stake(minStake);
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQStaking: You cannot stake tokens yet");
            }
        });
    });

    /*describe("Unstake", () => {
        it("STEP1: unstake: success", async () => {
        });
        it("STEP2:", async () => {
        });
        it("STEP3:", async () => {
        });
    });

    describe("Claim", () => {
        it("STEP1: stake: success", async () => {
            //await hre.ethers.provider.send("evm_setNextBlockTimestamp", []);
        });
        it("STEP2:", async () => {
        });
        it("STEP3:", async () => {
        });
    });

    describe("Admin functions", () => {
        it("STEP1: Update staking info", async () => {
        });
        it("STEP2: Set reward", async () => {
        });
        it("STEP3:", async () => {
        });
    });*/
});