const { expect } = require('chai');
const { time } = require('console');
const exp = require('constants');
const dotenv = require('dotenv');
const fs = require('fs');
const { ethers, upgrades } = require('hardhat');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const { parseEther } = require("ethers/lib/utils");
const startTime = Math.floor(Date.now() / 1000);
const moreThanDay = 86460;

for (const k in envConfig) {
    process.env[k] = envConfig[k]
}

describe('Governance token test', () => {
    // let token;
    let owner;
    let userOne;
    let userTwo;
    let userThree;
    let userFour;
    let totalSupplyOfWQToken = parseEther('100000000');
    let proposalThreshold = parseEther('10001');
    let totalSupplyWOProposalThreshold = parseEther((100000000 - 11001).toString());
    let twenty = parseEther('20');
    let thirty = parseEther('30');
    let fifty = parseEther('50');
    let oneK = parseEther('1000');
    let twoK = parseEther('2000');
    let fourK = parseEther('4000');
    let oneMln = parseEther('1000000');
    let tenMln = parseEther('10000000');
    let minimumQuorum = 3;
    let minute = ethers.BigNumber.from('60');
    let votingPeriod = ethers.BigNumber.from('86400'); // one day

    beforeEach(async () => {
        [owner, userOne, userTwo, userThree, userFour] = await ethers.getSigners();
        const WQToken = await ethers.getContractFactory('WQToken');
        token = await upgrades.deployProxy(WQToken, [totalSupplyOfWQToken], { initializer: 'initialize', kind: 'transparent' });
        await token.transfer(userOne.address, proposalThreshold);
        await token.transfer(userThree.address, oneK);
        await token.connect(userOne).delegate(userOne.address, proposalThreshold);
    })
    /*
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
                    expect((await token.getVotes([owner.address]))[0]).to.equal(0)
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
                    ).to.revertedWith('WQT: Decreased allowance below zero')
                })
            })
            describe('Transfer', () => {
                it('Transfer to user', async () => {
                    let balanceOfOwner = await token.balanceOf(owner.address);
                    let balanceOfUserOne = await token.balanceOf(userOne.address);
                    await token.transfer(userOne.address, oneK);
                    let balanceOfOwnerAfter = await balanceOfOwner.sub(oneK);
                    let balanceOfUserAfter = await balanceOfUserOne.add(oneK);
                    expect(await token.balanceOf(userOne.address)).to.equal(balanceOfUserAfter);
                    expect(await token.balanceOf(owner.address)).to.equal(balanceOfOwnerAfter);
                })
                it('TransferFrom', async () => {
                    await token.increaseAllowance(userOne.address, fifty);
                    await expect(
                        token.connect(userOne).transferFrom(owner.address, userTwo.address, fifty)
                    ).to.not.reverted;
                    expect(await token.balanceOf(userTwo.address)).to.equal(fifty);
                })
                it("Shouldn't transfer more than balance", async () => {
                    let balanceOfUserOne = await token.balanceOf(userOne.address);
                    let moreThanUserHave = await balanceOfUserOne.add(oneK);
                    await expect(
                        token.connect(userOne).transfer(userTwo.address, moreThanUserHave)
                    ).to.be.revertedWith('WQT: Token amount exceeds balance')
                })
                it("Shouldn't transfer from user more than balance", async () => {
                    await token.connect(userTwo).increaseAllowance(userOne.address, parseEther('50'));
                    await expect(
                        token.connect(userOne).transferFrom(userTwo.address, userOne.address, parseEther('50'))
                    ).to.revertedWith('WQT: Token amount exceeds balance');
                })
                it("Shouldn't transfer more than allowance", async () => {
                    await expect(
                        token
                            .connect(userOne)
                            .transferFrom(
                                owner.address,
                                userTwo.address,
                                parseEther('50')
                            )
                    ).to.be.revertedWith('WQT: Transfer amount exceeds allowance')
                })
            })
            describe('Delegate', () => {
                it('Delegate to user', async () => {
                    await token.delegate(userFour.address, tenMln)
                    expect((await token.getVotes([userFour.address]))[0]).to.equal(
                        tenMln
                    )
                    expect(await token.delegates(owner.address)).to.equal(
                        userFour.address
                    )
                    expect(await token.freezed(owner.address)).to.equal(tenMln)
                })
                it('Withdraw delegate', async () => {
                    let balanceOfOwner = await token.balanceOf(owner.address);
                    await token.delegate(userTwo.address, tenMln);
                    await token.undelegate();
                    let votePowerOfUserTwo = tenMln.sub(oneMln);
                    expect((await token.getVotes([userTwo.address]))[0]).to.equal(0);
                    expect(await token.freezed(owner.address)).to.equal(0);
                });
                it('Should properly change votepower and balance after redelegating', async () => {
                    // TODO test is not work rigth as planed, if reledegate from pair
                    // userA - UserB to UserC votePower of userC should equals UserC_delegates + UserB 
                    await token.delegate(userThree.address, tenMln);
                    // await token.undelegate();
                    await token.delegate(userTwo.address, tenMln);
                    expect(await token.delegates(owner.address)).to.equal(userTwo.address);
                    expect(await token.freezed(owner.address)).to.equal(tenMln);
                    expect((await token.getVotes([userThree.address]))[0]).to.equal(0);
                    expect((await token.getVotes([userTwo.address]))[0]).to.equal(tenMln);
                });
                it('Checkpoints', async () => {
                    await token.delegate(userOne.address, tenMln);
                    await token.undelegate();
                    await token.delegate(userTwo.address, tenMln);
                });
            });
        });
        */
});