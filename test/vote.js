const { expect } = require('chai');
const dotenv = require('dotenv');
const fs = require('fs');
const { ethers, upgrades, web3 } = require('hardhat');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const { parseEther } = require("ethers/lib/utils");
const moreThanDay = 86460;
const proposalThreshold = parseEther('30');
const votingThreshold = parseEther('10');
const oneK = parseEther('20');
const minimumQuorum = 3;
const votingPeriod = ethers.BigNumber.from('86400'); // one day
const fee = "1000000000000000";
const fee_proposal = "30000000000000000";
const fee_voting = "10000000000000000";
const fee_oneK = "20000000000000000";

for (const k in envConfig) {
    process.env[k] = envConfig[k]
}


describe('Vote test', () => {
    let owner;
    let userOne;
    let userTwo;
    let userThree;
    let nonce = 0;

    let vote;

    beforeEach(async () => {
        [owner, userOne, userTwo, userThree] = await ethers.getSigners();

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
        await vote.connect(userOne).delegate(userOne.address, { value: proposalThreshold });
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
            ).to.revertedWith('WQDAO: Proposer votes below proposal threshold')
        });
    });

    describe('Voting', () => {
        it('Should properly vote with enough votes', async () => {
            nonce++;
            await vote.connect(userThree).delegate(userThree.address, { value: oneK });
            await vote.connect(userOne).addProposal(nonce, "Should properly vote with enough votes");
            await vote.connect(userThree).doVote(0, true, { value: fee_oneK });
            expect(
                (await vote.getReceipt(0, userThree.address)).votes
            ).to.equal(oneK);
        });

        it("Shouldn't vote with wrong id", async () => {
            await expect(vote.connect(userOne).doVote(0, true, { value: fee_proposal })).to.revertedWith('Invalid proposal id');
        });

        it("Shouldn't vote on expired votes", async () => {
            nonce++;
            await vote.connect(userThree).delegate(userThree.address, { value: oneK });
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await ethers.provider.send("evm_increaseTime", [moreThanDay]);
            await ethers.provider.send("evm_mine", []);
            await expect(
                vote.connect(userThree).doVote(0, true, { value: fee_oneK })
            ).to.revertedWith('Proposal expired');
        });

        it("Shouldn't vote multiple times", async () => {
            nonce++;
            await vote.connect(userThree).delegate(userThree.address, { value: oneK });
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await vote.connect(userThree).doVote(0, true, { value: fee_oneK });
            await expect(
                vote.connect(userThree).doVote(0, true, { value: fee_oneK })
            ).to.revertedWith('Voter has already voted');
        });

        it("Shouldn't vote on executed votes", async () => {
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await ethers.provider.send("evm_increaseTime", [moreThanDay]);
            await ethers.provider.send("evm_mine", []);
            await vote.executeVoting(0);
            await expect(
                vote.connect(userOne).doVote(0, true, { value: fee_proposal })
            ).to.revertedWith('WQDAO: Voting is closed')
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
            await ethers.provider.send("evm_increaseTime", [moreThanDay]);
            await ethers.provider.send("evm_mine", []);
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
            await vote.connect(userTwo).delegate(userTwo.address, { value: votingThreshold });
            await vote.connect(userThree).delegate(userThree.address, { value: oneK });
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await vote.connect(userThree).doVote(0, true, { value: fee_oneK });
            await vote.connect(userOne).doVote(0, false, { value: fee_proposal });
            await vote.connect(userTwo).doVote(0, false, { value: fee_voting });
            await ethers.provider.send("evm_increaseTime", [moreThanDay]);
            await ethers.provider.send("evm_mine", []);
            await vote.executeVoting(0);
            expect(await vote.state(0)).to.equal(0);
        });

        it("Should return 'defeated' if not enough quorum", async () => {
            nonce++;
            await vote.connect(userThree).delegate(userThree.address, { value: oneK });
            await vote.connect(userOne).addProposal(nonce, 'Drink on thursdays');
            await vote.connect(userThree).doVote(0, true, { value: fee_oneK });
            await vote.connect(userOne).doVote(0, true, { value: fee_proposal });
            await ethers.provider.send("evm_increaseTime", [moreThanDay]);
            await ethers.provider.send("evm_mine", []);
            await vote.executeVoting(0);
            expect(await vote.state(0)).to.equal(0);
        });
    });
});

