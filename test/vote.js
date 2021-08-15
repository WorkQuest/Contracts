const { expect } = require('chai');
const exp = require('constants');
const dotenv = require('dotenv');
// const { ethers } = require('ethers');
const fs = require('fs');
const { ethers, upgrades } = require('hardhat');
const envConfig = dotenv.parse(fs.readFileSync(".env"));

for (const k in envConfig) {
    process.env[k] = envConfig[k]
}

describe('Governance token test', () => {
    let token;
    let owner;
    let user_one;
    let user_two;
    let user_three;

    beforeEach(async () => {
        [owner, user_one, user_two, user_three] = await ethers.getSigners();

        const WQToken = await ethers.getContractFactory('WQToken');
        token = await upgrades.deployProxy(WQToken, [ethers.utils.parseEther("100000000")], {initializer: 'initialize'});

        const DAOBallot = await ethers.getContractFactory("WQDAOBallot");
        vote = await DAOBallot.deploy(owner.address, token.address);
        await vote.addProposal("", 6000, 2);
    });
    describe("Deploy test", () => {
        it("Token deploy", async () => {
            expect(await token.owner()).to.equal(owner.address);
            expect(await token.totalSupply()).to.equal(ethers.utils.parseEther("100000000"));
            expect(await token.symbol()).to.equal("WQT");
            expect(await token.name()).to.equal("WorkQuest Token");
        })
        it("Vote deploy", async () => {
            expect(await vote.token()).to.equal(token.address);
            expect(await vote.name()).to.equal("DAO Ballot");
            // let admin = await vote._checkRole(owner.address);
            // console.log(admin);
        })
    })
    describe("Token test", () => {
        describe("Base functions", () => {
            it("BalanceOf", async () => {
                expect(await token.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("100000000"));
            });
            it("votePowerOf", async () => {
                expect(await token.votePowerOf(owner.address)).to.equal(0);
            });
        });
        describe("Allowance", () => {
            it("increaseAllowance", async () => {
                await token.connect(owner).increaseAllowance(user_one.address, ethers.utils.parseEther("50"));
                expect(await token.allowance(owner.address, user_one.address)).to.equal(ethers.utils.parseEther("50"));
            })
            it("decreaseAllowance", async () => {
                await token.connect(owner).increaseAllowance(user_one.address, ethers.utils.parseEther("50"));
                await token.connect(owner).decreaseAllowance(user_one.address, ethers.utils.parseEther("30"));
                expect(await token.allowance(owner.address, user_one.address)).to.equal(ethers.utils.parseEther("20"));
            })
            it("Shouldn't decrease allowance below zero", async () => {
                await expect(token.decreaseAllowance(user_one.address, ethers.utils.parseEther("30"))).to.revertedWith("WQT: decreased allowance below zero");
            })
        })
        describe("Transfer", () => {
            it("Transfer to user", async () => {
                await token.transfer(user_one.address, ethers.utils.parseEther("50000000"));
                expect(await token.balanceOf(user_one.address)).to.equal(ethers.utils.parseEther("50000000"));
                expect(await token.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("50000000"));
            })
            it("TransferFrom", async () => {
                await token.increaseAllowance(user_one.address, ethers.utils.parseEther("50"));
                await expect(token.connect(user_one).transferFrom(owner.address, user_two.address, ethers.utils.parseEther("50"))).to.not.reverted;
                expect(await token.balanceOf(user_two.address)).to.equal(ethers.utils.parseEther("50"));
            })
            it("Shouldn't transfer more than balance", async () => {
                await expect(token.connect(user_one).transfer(user_two.address, ethers.utils.parseEther("50"))).to.be.revertedWith("WQT: transfer amount exceeds balance");
            })
            it("Shouldn't transfer from user more than balance", async () => {
                await token.connect(user_two).increaseAllowance(user_one.address, ethers.utils.parseEther("50"));
                await expect(token.connect(user_one).transferFrom(user_two.address, user_one.address, ethers.utils.parseEther("50"))).to.revertedWith("WQT: transfer amount exceeds balance");
            })
            it("Shouldn't transfer more than allowance", async () => {
                await expect(token.connect(user_one).transferFrom(owner.address, user_two.address, ethers.utils.parseEther("50"))).to.be.revertedWith("WQT: transfer amount exceeds allowance");
            })
        })
        describe("Delegate", () => {
            it("Delegate to user", async () => {
                await token.delegate(user_one.address, ethers.utils.parseEther("10000000"));
                expect(await token.votePowerOf(user_one.address)).to.equal(ethers.utils.parseEther("10000000"));
                expect(await token.delegates(owner.address)).to.equal(user_one.address);
                expect(await token.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("90000000"));
            })
            it("Withdraw delegate", async () => {
                await token.delegate(user_one.address, ethers.utils.parseEther("10000000"));
                await token.withdrawVotingRights(user_one.address, ethers.utils.parseEther("1000000"));
                expect(await token.votePowerOf(user_one.address)).to.equal(ethers.utils.parseEther("9000000"));
                expect(await token.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("91000000"));
            })
            it("Should properly change votepower and balance after redelegating", async () => {
                await token.delegate(user_one.address, ethers.utils.parseEther("10000000"));
                await token.withdrawVotingRights(user_one.address, ethers.utils.parseEther("10000000"));
                await token.delegate(user_two.address, ethers.utils.parseEther("10000000"));
                expect(await token.delegates(owner.address)).to.equal(user_two.address);
                expect(await token.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("90000000"));
                expect(await token.votePowerOf(user_one.address)).to.equal(0);
                expect(await token.votePowerOf(user_two.address)).to.equal(ethers.utils.parseEther("10000000"));
            })
            it("Checkpoints", async () => {
                await token.delegate(user_one.address, ethers.utils.parseEther("10000000"));
                await token.withdrawVotingRights(user_one.address, ethers.utils.parseEther("10000000"));
                await token.delegate(user_two.address, ethers.utils.parseEther("10000000"));
            })
        })
    })
    describe("Vote test", () => {
        describe("Proposals", () => {
            it("Add proposal", async () => {
                await token.transfer(user_one.address, ethers.utils.parseEther("10001"));
                await expect(vote.connect(user_one).addProposal("", 600, ethers.utils.parseEther("10"))).to.not.reverted;
            })
            it("Shouldn't add proposal without enough votes for threshold", async () => {
                await expect(vote.connect(user_one).addProposal("", 600, ethers.utils.parseEther("10"))).to.revertedWith("Proposer votes below proposal threshold");
            })
        })
        describe("Voting", () => {
            it("Should properly vote with enough votes", async () => {
                await token.delegate(owner.address, ethers.utils.parseEther("100"));
                await vote.doVote(0, true, "");
                expect((await vote.getReceipt(0, owner.address)).votes).to.equal(ethers.utils.parseEther("100"));
            })
            it("Shouldn't vote with wrong id", async () => {
                await expect(vote.doVote(1, true, "")).to.revertedWith("Invalid proposal id");
            })
            it("Shouldn't vote on expired votes", async () => {
                await vote.addProposal("", 0, ethers.utils.parseEther("10"));
                await expect(vote.doVote(1, true, "")).to.revertedWith("Proposal expired");
            })
            it("Shouldn't vote multiple times", async () => {
                await vote.doVote(0, true, "");
                await expect(vote.doVote(0, true, "")).to.revertedWith("Voter has already voted");

            })
            it("Shouldn't vote on executed votes", async () => {
                await vote.executeVoting(0);
                await expect(vote.doVote(0, true, "")).to.revertedWith("Voting is closed");
            })
        })
        describe("Executing", () => {
            it("Shouldn't execute without role", async () => {
                await expect(vote.connect(user_one).executeVoting(0)).to.revertedWith("Caller is not a chairperson");
            })
            it("Shouldn't execute proposal with wrong id", async () => {
                await expect(vote.executeVoting(1)).to.revertedWith("Invalid proposal id");
            })
            it("Shouldn't execute already executed proposal", async () => {
                await vote.executeVoting(0)
                await expect(vote.executeVoting(0)).to.revertedWith("Voting is closed");
            })
            it("State should return '2' if proposal is active", async () => {
                expect(await vote.state(0)).to.equal(2);
            })
            it("Should properly execute proposal", async () => {
                await token.transfer(user_one.address, ethers.utils.parseEther("1000"));
                await token.transfer(user_two.address, ethers.utils.parseEther("2000"));
                await token.delegate(owner.address, ethers.utils.parseEther("4000"));
                await token.connect(user_one).delegate(user_one.address, ethers.utils.parseEther("1000"));
                await token.connect(user_two).delegate(user_two.address, ethers.utils.parseEther("2000"));
                await vote.doVote(0, true, "");
                await vote.connect(user_one).doVote(0, false, "");
                await vote.connect(user_two).doVote(0, false, "");
                await vote.executeVoting(0);
                expect(await vote.state(0)).to.equal(1);
            })
            it("Should return 'defeated' if not enough quorum", async () => {
                await token.delegate(owner.address, ethers.utils.parseEther("4000"));
                await vote.doVote(0, true, "");
                await vote.executeVoting(0);
                expect(await vote.state(0)).to.equal(0);
            })
        })
    })
})