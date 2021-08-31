const { expect } = require("chai");
const hre = require('hardhat');
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

function getValidStakingTimestamp(offset) {
    var result = Math.round(Date.now() / 1000);
    console.log(`function getValidStakingTimestamp(): starting from ${result}`);
    while (!(result % 86400 >= 600 && result % 86400 <= 85800)) {
        result++;
    }
    result += offset
    console.log(`function getValidStakingTimestamp(): returning ${result}`);
    return result;
}

describe("2. Staking NATIVE tests", () => {
    let staking;
    let token;
    let staking_deploy_block;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        const WQToken = await ethers.getContractFactory('WQToken');
        token = await upgrades.deployProxy(WQToken, [parseEther("25000000000000")], { initializer: 'initialize' });
        let bl_num = await hre.ethers.provider.send("eth_blockNumber", []);
        staking_deploy_block = await hre.ethers.provider.send("eth_getBlockByNumber", [bl_num, false]);
        const Staking = await ethers.getContractFactory("WQStakingNative");
        staking = await upgrades.deployProxy(Staking, [parseInt(staking_deploy_block.timestamp), rewardDelta1, rewardDelta2, distributionTime, stakePeriod, claimPeriod, minStake, maxStake, token.address], { initializer: 'initialize' });
        await token.transfer(staking.address, parseEther("2500000000000"));
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
            // expect(
            //     staking_info.stakeTokenAddress
            // ).to.to.equal(token.address);
            expect(
                staking_info.rewardTokenAddress
            ).to.to.equal(token.address);
        });
    });

    describe("Stake", () => {
        it("STEP1: stake: success", async () => {
            let timestamp = getValidStakingTimestamp(10454600);
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
            let balanceBeforeStake = await hre.ethers.provider.getBalance(accounts[1].address)
            expect(Math.floor(balanceBeforeStake / 1e18)).to.be.equal(10000);
            let overrides = {
                value: ethers.utils.parseEther("100")
            }
            await staking.connect(accounts[1]).stake(overrides);
            let balanceAfterStake = await hre.ethers.provider.getBalance(accounts[1].address);
            expect(Math.floor(balanceAfterStake / 1e18)).to.equal(9899);
            let bl_num = await hre.ethers.provider.send("eth_blockNumber", []);
            let cur_block = await hre.ethers.provider.send("eth_getBlockByNumber", [bl_num, false]);
            let block_time = parseInt(cur_block.timestamp);
            let user_info = await staking.stakes(accounts[1].address);
            expect(
                user_info.amount
            ).to.equal(minStake);

            expect(
                user_info.rewardDebt
            ).to.equal(0);
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
                await staking.totalStaked()
            ).to.equal(minStake);
            expect(
                await staking.tokensPerStake()
            ).to.equal(0);
            expect(
                await staking.rewardProduced()
            ).to.equal(0);
        });

        it("STEP2: stake less than minimum: fail", async () => {
            try {
                let overrides = {
                    value: ethers.utils.parseEther("99")
                }
                await staking.connect(accounts[1]).stake(overrides);
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQStaking: Amount should be greater than minimum stake");
            }
        });
        it("STEP3: stake greater than maximum: fail", async () => {
            await hre.network.provider.send("hardhat_setBalance", [
                accounts[1].address,
                "0x1A784C264BCDFD0000000"
              ]);
            try {
                let overrides = {
                    value: maxStake + 1
                }
                await staking.connect(accounts[1]).stake(overrides);
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQStaking: Amount should be less than maximum stake");
            }
        });
        it("STEP4: stake more often than a stake period: fail", async () => {
            await token.connect(accounts[1]).approve(staking.address, minStake);
            let overrides = {
                value: minStake
            }
            await staking.connect(accounts[1]).stake(overrides);
            try {
                await staking.connect(accounts[1]).stake(overrides);
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQStaking: You cannot stake tokens yet");
            }
        });
    });

    describe("Unstake", () => {
        it("STEP1: unstake: success", async () => {
            let timestamp = getValidStakingTimestamp(10454917);
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
            let durationShort = 30;
            let durationLong = stakePeriod * durationShort;
            let balanceBeforeStake = await hre.ethers.provider.getBalance(accounts[1].address);

            //expect(Math.floor(balanceBeforeStake / 1e18)).to.equal(1999909);
            let overrides = {
                value: minStake
            }
            await staking.connect(accounts[1]).stake(overrides);
            let balanceAfterStake = await hre.ethers.provider.getBalance(accounts[1].address);
            expect(Math.floor(balanceAfterStake / 1e18)).to.equal(1999809);

            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [timestamp + durationLong]);
            await staking.connect(accounts[1]).unstake(minStake);

            balanceAfterUnstake = await hre.ethers.provider.getBalance(accounts[1].address);

            expect(Math.floor(balanceAfterUnstake / 1e18)).to.equal(Math.floor(balanceBeforeStake / 1e18));
        });

        it("STEP2: unstake greater than staked", async () => {
            let timestamp = getValidStakingTimestamp(10454937 + stakePeriod * 30);
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
            let durationShort = 30;
            let durationLong = stakePeriod * durationShort;
            let balanceBeforeStake = await hre.ethers.provider.getBalance(accounts[1].address);

            expect(Math.floor(balanceBeforeStake / 1e18)).to.equal(1999909);
            let overrides = {
                value: minStake
            }
            await staking.connect(accounts[1]).stake(overrides);
            await hre.ethers.provider.getBalance(accounts[1].address);

            let balanceAfterStake = await hre.ethers.provider.getBalance(accounts[1].address);

            expect(Math.floor(balanceAfterStake / 1e18)).to.equal(1999809);

            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [timestamp + durationLong]);
            await expect(staking.connect(accounts[1]).unstake(minStake + 1)).to.be.revertedWith("WQStaking: Not enough tokens to unstake");

            let balanceAfterUnstake = await hre.ethers.provider.getBalance(accounts[1].address);

            expect(Math.floor(balanceAfterUnstake / 1e18)).to.equal(Math.floor(balanceAfterStake / 1e18));
        });
        it("STEP3: unstake earlier than unstake time", async () => {
            await token.connect(accounts[1]).approve(staking.address, minStake);
            let timestamp = getValidStakingTimestamp(10454967 + 86400 + stakePeriod * 60);
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
            let durationShort = 30;
            let durationLong = stakePeriod * durationShort;
            let balanceBeforeStake = await hre.ethers.provider.getBalance(accounts[1].address);

            expect(Math.floor(balanceBeforeStake / 1e18)).to.equal(1999809);

            let overrides = {
                value: minStake
            }
            await staking.connect(accounts[1]).stake(overrides);

            let balanceAfterStake = await hre.ethers.provider.getBalance(accounts[1].address);
            expect(Math.floor(balanceAfterStake / 1e18)).to.equal(1999709);

            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [timestamp + durationLong - 2000]);
            await expect(staking.connect(accounts[1]).unstake(minStake)).to.be.revertedWith("WQStaking: Daily lock");

            let balanceAfterUnstake = await hre.ethers.provider.getBalance(accounts[1].address);
            expect(Math.floor(balanceAfterUnstake / 1e18)).to.equal(Math.floor(balanceAfterStake / 1e18));
        });
    });
/**
 *       "100.000000000000000000" - staked
 *     "7 600.000000000000000000" - expected
 195953232000.000000000000000000
 * "7 600 000.000000000000000000" - actual
 */
    describe("Claim", () => {
        it("STEP1: stake: success", async () => {
            await token.connect(accounts[1]).approve(staking.address, minStake);
            let timestamp = getValidStakingTimestamp(stakePeriod * 1200);
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
            let durationShort = 30;
            let durationLong = stakePeriod * durationShort;
            let balanceBeforeStake = await hre.ethers.provider.getBalance(accounts[1].address);

            expect(Math.floor(balanceBeforeStake / 1e18)).to.equal(1999709);
            let overrides = {
                value: minStake
            }
            await staking.connect(accounts[1]).stake(overrides);

            let balanceAfterStake = await hre.ethers.provider.getBalance(accounts[1].address);
            expect(Math.floor(balanceAfterStake / 1e18)).to.equal(1999609);

            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [timestamp + durationLong]);

            let _addressInfo = await staking.getInfoByAddress(accounts[1].address);
            expect(_addressInfo.staked_).to.equal(minStake);
            expect(_addressInfo._balance).to.equal(balanceAfterStake);

            console.log(`Claim is              \'${_addressInfo.claim_}\'`) // какое-то сумасшедшее число
            console.log(`Staked                \'${_addressInfo.staked_}\'`)
            console.log(`Balance of staking is \'${await token.balanceOf(staking.address)}\'`)

            let tokenBalanceBefore = await token.balanceOf(accounts[1].address);
            expect(tokenBalanceBefore).to.equal(0);
            await staking.connect(accounts[1]).claim();
            let tokenBalanceAfter = await token.balanceOf(accounts[1].address);
            expect(tokenBalanceAfter > 1000000).to.be.true;
        });
    });

    describe("Admin functions", () => {
        it("STEP1: Update staking info (as admin)", async () => {
            let _tps = 10;
            let _totalStaked = 20;
            let _totalDistributed = 30;
            await staking.updateStakingInfo(_tps, _totalStaked, _totalDistributed);
            let tpsContract = await staking.tokensPerStake();
            let staking_info = await staking.getStakingInfo();
            expect(staking_info.totalStaked).to.equal(_totalStaked);
            expect(staking_info.totalDistributed).to.equal(_totalDistributed);
            expect(tpsContract).to.equal(_tps);
        });

        it("STEP2: Update staking info (as not admin)", async () => {
            let _tps = 10;
            let _totalStaked = 20;
            let _totalDistributed = 30;
            let tpsContractBefore = await staking.tokensPerStake();
            let staking_infoBefore = await staking.getStakingInfo();
            await expect(staking.connect(accounts[1]).updateStakingInfo(_tps, _totalStaked, _totalDistributed)).to.be.revertedWith("is missing role");
            let tpsContractAfter = await staking.tokensPerStake();
            let staking_infoAfter = await staking.getStakingInfo();
            expect(staking_infoBefore.totalStaked).to.equal(staking_infoAfter.totalStaked);
            expect(staking_infoBefore.totalDistributed).to.equal(staking_infoAfter.totalDistributed);
            expect(tpsContractBefore).to.equal(tpsContractAfter);
        });

        it("STEP3: Set reward (as admin)", async () => {
            let _rewardDelta1 = 10;
            await staking.setReward(_rewardDelta1);
            let _rewardDelta1Contract = await staking.rewardDelta1();
            let _distributionTimeContract = await staking.producedTime();
            let blNum = await hre.ethers.provider.send("eth_blockNumber", []);
            txBlockNumber = await hre.ethers.provider.send("eth_getBlockByNumber", [blNum, false]);
            expect(_rewardDelta1Contract).to.equal(_rewardDelta1);
            expect(txBlockNumber.timestamp).to.equal(_distributionTimeContract);
        });

        it("STEP4: Set reward (as not admin)", async () => {
            let _rewardDelta1 = 10;
            let _rewardDelta1ContractBefore = await staking.rewardDelta1();
            let _distributionTimeContractBefore = await staking.producedTime();
            await expect(staking.connect(accounts[1]).setReward(_rewardDelta1)).to.be.revertedWith("is missing role");
            let _rewardDelta1ContractAfter = await staking.rewardDelta1();
            let _distributionTimeContractAfter = await staking.producedTime();
            expect(_rewardDelta1ContractAfter).to.equal(_rewardDelta1ContractBefore);
            expect(_distributionTimeContractBefore).to.equal(_distributionTimeContractAfter);
        });

        it("STEP5: Update staker info (as admin)", async () => {
            let _user = accounts[1].address;
            let _amount = 10;
            let _rewardAllowed = 20;
            let _rewardDebt = 30;
            let _distributed = 40;
            await staking.updateStakerInfo(_user, _amount, _rewardAllowed, _rewardDebt, _distributed);
            let _staker = await staking.stakes(_user);
            expect(_staker.amount).to.equal(_amount);
            expect(_staker.rewardAllowed).to.equal(_rewardAllowed);
            expect(_staker.rewardDebt).to.equal(_rewardDebt);
            expect(_staker.distributed).to.equal(_distributed);
        });

        it("STEP6: Update staker info (as not admin)", async () => {
            let _user = accounts[1].address;
            let _amount = 10;
            let _rewardAllowed = 20;
            let _rewardDebt = 30;
            let _distributed = 40;
            let _stakerBefore = await staking.stakes(_user);
            await expect(staking.connect(accounts[1]).updateStakerInfo(_user, _amount, _rewardAllowed, _rewardDebt, _distributed)).to.be.revertedWith("is missing role");
            let _stakerAfter = await staking.stakes(_user);
            expect(_stakerBefore.amount).to.equal(_stakerAfter.amount);
            expect(_stakerBefore.rewardAllowed).to.equal(_stakerAfter.rewardAllowed);
            expect(_stakerBefore.rewardDebt).to.equal(_stakerAfter.rewardDebt);
            expect(_stakerBefore.distributed).to.equal(_stakerAfter.distributed);
        });
    });
});
