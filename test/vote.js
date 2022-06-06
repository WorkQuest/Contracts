const { expect } = require('chai');
const { time } = require('console');
const exp = require('constants');
const dotenv = require('dotenv');
const fs = require('fs');
const { ethers, upgrades, web3 } = require('hardhat');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const { parseEther } = require("ethers/lib/utils");
const startTime = Math.floor(Date.now() / 1000);
const moreThanDay = 86460;

for (const k in envConfig) {
    process.env[k] = envConfig[k]
}


describe('Vote test', () => {
    let owner;
    let userOne;
    let userTwo;
    let userThree;
    let userFour;
    let proposalThreshold = parseEther('10000');
    let votingThreshold = parseEther('100');
    let oneK = parseEther('1000');
    let minimumQuorum = 3;
    let votingPeriod = ethers.BigNumber.from('86400'); // one day
    let nonce = 0;
    let fee = "1000000000000000";

    beforeEach(async () => {
        [owner, userOne, userTwo, userThree, userFour] = await ethers.getSigners();
        await web3.eth.sendTransaction({ from: userTwo.address, to: userOne.address, value: parseEther("2") })
        const DAOBallot = await ethers.getContractFactory('WQDAOVoting');
        vote = await upgrades.deployProxy(DAOBallot,
            [
                owner.address,
                minimumQuorum,
                votingPeriod,
                proposalThreshold,
                votingThreshold,
                fee
            ],
            { initializer: 'initialize', kind: 'transparent' });
        await vote.deployed();
    });

    describe('Proposals', () => {
        it('Add proposal', async () => {
            nonce++;
            await expect(
                vote.connect(userOne).addProposal(nonce, 'IPA is better than lager')
            ).to.not.reverted;
        });

        it("Shouldn't add proposal without enough votes for threshold", async () => {
            nonce++;
            await expect(
                vote.connect(userTwo).addProposal(nonce, "Too poor can't proposal is not right")
            ).to.revertedWith('Proposer votes below proposal threshold')
        });
    });

    describe('Voting', () => {
        it('Should properly vote with enough votes', async () => {
            nonce++;
            await vote.connect(userOne).addProposal(nonce, "Should properly vote with enough votes");
            await vote.connect(userThree).doVote(0, true);
            expect(
                (await vote.getReceipt(0, userThree.address)).votes
            ).to.equal(oneK);
        });

        it("Shouldn't vote with wrong id", async () => {
            await expect(vote.doVote(0, true)).to.revertedWith('Invalid proposal id');
        });

        it("Shouldn't vote on expired votes", async () => {
            nonce++;
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await ethers.provider.send("evm_increaseTime", [moreThanDay]);
            await ethers.provider.send("evm_mine", []);
            await expect(
                vote.connect(userThree).doVote(0, true)
            ).to.revertedWith('Proposal expired');
        });

        it("Shouldn't vote multiple times", async () => {
            nonce++;
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await vote.connect(userThree).doVote(0, true);
            await expect(
                vote.connect(userThree).doVote(0, true)
            ).to.revertedWith('Voter has already voted');
        });

        it("Shouldn't vote on executed votes", async () => {
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await vote.executeVoting(0);
            await expect(
                vote.connect(userOne).doVote(0, true)
            ).to.revertedWith('Voting is closed')
        });
    });

    describe('Executing', () => {
        it("Shouldn't execute without role", async () => {
            let role = await vote.CHAIRPERSON_ROLE();
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await expect(
                vote.connect(userOne).executeVoting(0)
            ).to.revertedWith(
                `AccessControl: account ${userOne.address.toLowerCase()} is missing role ${role}`);
        });

        it("Shouldn't execute proposal with wrong id", async () => {
            await expect(
                vote.executeVoting(1)
            ).to.revertedWith('Invalid proposal id');
        });

        it("Shouldn't execute already executed proposal", async () => {
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await vote.executeVoting(0)
            await expect(
                vote.executeVoting(0)
            ).to.revertedWith('Voting is closed');
        });

        it("State should return '2' if proposal is active", async () => {
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            expect(await vote.state(0)).to.equal(2)
        });

        it('Should properly execute proposal', async () => {
            nonce++;
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await vote.doVote(0, true);
            await vote.connect(userOne).doVote(0, false);
            await vote.connect(userTwo).doVote(0, false);
            await vote.executeVoting(0);
            expect(await vote.state(0)).to.equal(0);
        });

        it("Should return 'defeated' if not enough quorum", async () => {
            nonce++;
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await vote.connect(userThree).doVote(0, true);
            await vote.executeVoting(0);
            expect(await vote.state(0)).to.equal(0);
        });
    });
});

