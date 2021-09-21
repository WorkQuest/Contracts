const { expect } = require('chai')
const { time } = require('console')
const exp = require('constants')
const dotenv = require('dotenv')
const fs = require('fs')
const { ethers, upgrades } = require('hardhat')
const envConfig = dotenv.parse(fs.readFileSync('.env'))

const startTime = Math.floor(Date.now() / 1000);
const moreThanDay = 86460;

for (const k in envConfig) {
    process.env[k] = envConfig[k]
}

describe('Governance token test', () => {
    let token
    let owner
    let userOne
    let userTwo
    let userThree
    let totalSupplyOfWQToken = ethers.utils.parseEther('100000000')
    let proposalThreshold = ethers.utils.parseEther('10001')
    let totalSupplyWOProposalThreshold = ethers.utils.parseEther(
        (100000000 - 10001).toString()
    )
    let twenty = ethers.utils.parseEther('20')
    let thirty = ethers.utils.parseEther('30')
    let fifty = ethers.utils.parseEther('50')
    let oneK = ethers.utils.parseEther('1000')
    let twoK = ethers.utils.parseEther('2000')
    let fourK = ethers.utils.parseEther('4000')
    let oneMln = ethers.utils.parseEther('1000000')
    let tenMln = ethers.utils.parseEther('10000000')
    let minimumQuorum = ethers.utils.parseEther('3')
    let minute = ethers.BigNumber.from('60')
    let votingPeriod = ethers.BigNumber.from('86400') // one day

    beforeEach(async () => {
        ;[owner, userOne, userTwo, userThree] = await ethers.getSigners()

        const WQToken = await ethers.getContractFactory('WQToken')
        token = await upgrades.deployProxy(WQToken, [totalSupplyOfWQToken], {
            initializer: 'initialize',
        })

        const DAOBallot = await ethers.getContractFactory('WQDAOVoting')
        vote = await DAOBallot.deploy(owner.address, token.address)
        await vote.deployed()
        vote.changeVotingRules(minimumQuorum, votingPeriod)

        await token.transfer(userOne.address, proposalThreshold)
        await expect(
            vote
                .connect(userOne)
                .addProposal(
                    userTwo.address,
                    'Free beer for workers on friday',
                    123
                )
        ).to.not.reverted
    })
    describe('Deploy test', () => {
        it('Token deploy', async () => {
            expect(await token.owner()).to.equal(owner.address)
            expect(await token.totalSupply()).to.equal(totalSupplyOfWQToken)
            expect(await token.symbol()).to.equal('WQT')
            expect(await token.name()).to.equal('WorkQuest Token')
        })
        it('Vote deploy', async () => {
            expect(await vote.token()).to.equal(token.address)
            expect(await vote.name()).to.equal('WorkQuest DAO Voting')
            expect(await vote.votingPeriod()).to.equal(votingPeriod)
            expect(await vote.minimumQuorum()).to.equal(minimumQuorum)
        })
    })
    describe('Token test', () => {
        describe('Base functions', () => {
            it('BalanceOf', async () => {
                expect(await token.balanceOf(owner.address)).to.equal(
                    totalSupplyWOProposalThreshold
                )
            })
            it('votePowerOf', async () => {
                expect(await token.votePowerOf(owner.address)).to.equal(0)
            })
        })
        describe('Allowance', () => {
            it('increaseAllowance', async () => {
                await token
                    .connect(owner)
                    .increaseAllowance(userOne.address, fifty)
                expect(
                    await token.allowance(owner.address, userOne.address)
                ).to.equal(fifty)
            })
            it('decreaseAllowance', async () => {
                await token
                    .connect(owner)
                    .increaseAllowance(userOne.address, fifty)
                await token
                    .connect(owner)
                    .decreaseAllowance(userOne.address, thirty)
                expect(
                    await token.allowance(owner.address, userOne.address)
                ).to.equal(twenty)
            })
            it("Shouldn't decrease allowance below zero", async () => {
                await expect(
                    token.decreaseAllowance(userOne.address, thirty)
                ).to.revertedWith('WQT: decreased allowance below zero')
            })
        })
        describe('Transfer', () => {
            it('Transfer to user', async () => {
                let balanceOfOwner = await token.balanceOf(owner.address);
                let balanceOfUserOne = await token.balanceOf(userOne.address);
                await token.transfer(userOne.address, oneK)
                let balanceOfOwnerAfter = await balanceOfOwner.sub(oneK);
                let balanceOfUserAfter = await balanceOfUserOne.add(oneK);
                expect(await token.balanceOf(userOne.address)).to.equal(balanceOfUserAfter)
                expect(await token.balanceOf(owner.address)).to.equal(
                    balanceOfOwnerAfter
                )
            })
            it('TransferFrom', async () => {
                await token.increaseAllowance(userOne.address, fifty)
                await expect(
                    token
                        .connect(userOne)
                        .transferFrom(owner.address, userTwo.address, fifty)
                ).to.not.reverted
                expect(await token.balanceOf(userTwo.address)).to.equal(fifty)
            })
            it("Shouldn't transfer more than balance", async () => {
                let balanceOfUserOne = await token.balanceOf(userOne.address);
                let moreThanUserHave = await balanceOfUserOne.add(oneK);
                await expect(
                    token.connect(userOne).transfer(userTwo.address, moreThanUserHave)
                ).to.be.revertedWith('WQT: transfer amount exceeds balance')
            })
            it("Shouldn't transfer from user more than balance", async () => {
                await token
                    .connect(userTwo)
                    .increaseAllowance(
                        userOne.address,
                        ethers.utils.parseEther('50')
                    )
                await expect(
                    token
                        .connect(userOne)
                        .transferFrom(
                            userTwo.address,
                            userOne.address,
                            ethers.utils.parseEther('50')
                        )
                ).to.revertedWith('WQT: transfer amount exceeds balance')
            })
            it("Shouldn't transfer more than allowance", async () => {
                await expect(
                    token
                        .connect(userOne)
                        .transferFrom(
                            owner.address,
                            userTwo.address,
                            ethers.utils.parseEther('50')
                        )
                ).to.be.revertedWith('WQT: transfer amount exceeds allowance')
            })
        })
        describe('Delegate', () => {
            it('Delegate to user', async () => {
                let balanceOfOwner = await token.balanceOf(owner.address);
                await token.delegate(userOne.address, tenMln)
                expect(await token.votePowerOf(userOne.address)).to.equal(
                    tenMln
                )
                expect(await token.delegates(owner.address)).to.equal(
                    userOne.address
                )
                let balanceAfter = balanceOfOwner.sub(tenMln)
                expect(await token.balanceOf(owner.address)).to.equal(
                    balanceAfter
                )
            })
            it('Withdraw delegate', async () => {
                let balanceOfOwner = await token.balanceOf(owner.address);
                await token.delegate(userTwo.address, tenMln)
                await token.withdrawVotingRights(
                    userTwo.address,
                    oneMln
                )
                let votePowerOfUserTwo = tenMln.sub(oneMln)
                let balanceOfOwnerAfter = balanceOfOwner.sub(votePowerOfUserTwo)
                expect(await token.votePowerOf(userTwo.address)).to.equal(
                    votePowerOfUserTwo
                )
                expect(await token.balanceOf(owner.address)).to.equal(
                    balanceOfOwnerAfter
                )
            })
            it('Should properly change votepower and balance after redelegating', async () => {
                // TODO test is not work rigth as planed, if reledegate from pair
                // userA - UserB to UserC votePower of userC should equals UserC_delegates + UserB 
                let balanceOfOwner = await token.balanceOf(owner.address)
                await token.delegate(userOne.address, tenMln)
                await token.withdrawVotingRights(userOne.address, tenMln)
                await token.delegate(userTwo.address, tenMln)
                let balanceOfOwnerAfter = balanceOfOwner.sub(tenMln)
                expect(await token.delegates(owner.address)).to.equal(
                    userTwo.address
                )
                expect(await token.balanceOf(owner.address)).to.equal(
                    balanceOfOwnerAfter
                )
                let zero = tenMln.sub(tenMln)
                expect(await token.votePowerOf(userOne.address)).to.equal(zero)
                expect(await token.votePowerOf(userTwo.address)).to.equal(
                    tenMln
                )
            })
            it('Checkpoints', async () => {
                await token.delegate(userOne.address, tenMln)
                await token.withdrawVotingRights(userOne.address, tenMln)
                await token.delegate(userTwo.address, tenMln)
            })
            it('Delegate twice, second time more than first time', async () => {
                await token.transfer(userOne.address, fifty)
                await token.connect(userOne).delegate(userTwo.address, twenty)
                await token.connect(userOne).delegate(userThree.address, thirty)
                expect( await token.votePowerOf(userThree.address)).to.equal(
                    fifty
                )
            })
            // another test scenarios 
            // redelegate less than first time  
            // redelegates zero amount 
            // 

        })
    })
    describe('Vote test', () => {
        describe('Proposals', () => {
            it('Add proposal', async () => {
                await token.transfer(userOne.address, proposalThreshold)
                await expect(
                    vote
                        .connect(userOne)
                        .addProposal(
                            userTwo.address,
                            'IPA is better than lager',
                            123
                        )
                ).to.not.reverted
            })
            it("Shouldn't add proposal without enough votes for threshold", async () => {
                await expect(
                    vote
                        .connect(userTwo)
                        .addProposal(
                            userTwo.address,
                            "Too poor can't proposal is not right",
                            123
                        )
                ).to.revertedWith('Proposer votes below proposal threshold')
            })
        })
        describe('Voting', () => {
            it('Should properly vote with enough votes', async () => {
                await token.delegate(owner.address, oneK)
                await vote.doVote(0, true, '')
                expect(
                    (await vote.getReceipt(0, owner.address)).votes
                ).to.equal(oneK)
            })
            it("Shouldn't vote with wrong id", async () => {
                await token.delegate(owner.address, oneK)
                await expect(vote.doVote(1, true, '')).to.revertedWith(
                    'Invalid proposal id'
                )
            })
            it("Shouldn't vote on expired votes", async () => {
                await token.delegate(owner.address, oneK)
                await vote.addProposal(
                    userOne.address,
                    'Drink on thursdays',
                    123
                )
            
                await ethers.provider.send("evm_increaseTime", [moreThanDay]);
                await ethers.provider.send("evm_mine", []);

                await expect(vote.doVote(1, true, '')).to.revertedWith(
                    'Proposal expired'
                )
            })
            it("Shouldn't vote multiple times", async () => {
                await token.delegate(owner.address, oneK)
                await vote.doVote(0, true, '')
                await token.delegate(owner.address, oneK)
                await expect(vote.doVote(0, true, '')).to.revertedWith(
                    'Voter has already voted'
                )
            })
            it("Shouldn't vote on executed votes", async () => {
                await vote.executeVoting(0)
                await token.delegate(owner.address, oneK)
                await expect(vote.doVote(0, true, '')).to.revertedWith(
                    'Voting is closed'
                )
            })
        })
        describe('Executing', () => {
            it("Shouldn't execute without role", async () => {
                await expect(
                    vote.connect(userOne).executeVoting(0)
                ).to.revertedWith('Caller is not a chairperson')
            })
            it("Shouldn't execute proposal with wrong id", async () => {
                await expect(vote.executeVoting(1)).to.revertedWith(
                    'Invalid proposal id'
                )
            })
            it("Shouldn't execute already executed proposal", async () => {
                await vote.executeVoting(0)
                await expect(vote.executeVoting(0)).to.revertedWith(
                    'Voting is closed'
                )
            })
            it("State should return '2' if proposal is active", async () => {
                expect(await vote.state(0)).to.equal(2)
            })
            it('Should properly execute proposal', async () => {
                await token.transfer(userOne.address, oneK)
                await token.transfer(userTwo.address, twoK)
                await token.transfer(userThree.address, twoK)
                await token.delegate(owner.address, fourK)
                await token.connect(userOne).delegate(userOne.address, oneK)
                await token.connect(userTwo).delegate(userTwo.address, twoK)
                await vote.doVote(0, true, '')
                await vote.connect(userOne).doVote(0, false, '')
                await vote.connect(userTwo).doVote(0, false, '')
                await vote.executeVoting(0)
                expect(await vote.state(0)).to.equal(0)
            })
            it("Should return 'defeated' if not enough quorum", async () => {
                await token.delegate(owner.address, fourK)
                await vote.doVote(0, true, '')
                await vote.executeVoting(0)
                expect(await vote.state(0)).to.equal(0)
            })
        })
    })
})
