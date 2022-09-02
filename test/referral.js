const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'))
const { expect } = require('chai')
const { ethers } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });


const nullstr = '0x0000000000000000000000000000000000000000';


describe('Referral test', () => {
    let sig;

    beforeEach(async () => {
        message = await web3.utils.soliditySha3(
            { t: 'address', v: affiliat.address },
            { t: 'address', v: worker.address });
        let signature = await web3.eth.sign(message, validator.address);
        sig = ethers.utils.splitSignature(signature)
    });

    describe('Testing referal contract', () => {

        it('TEST 1: Add affiliat for worker, revert 1: if affiliat is zero', async () => {
            await expect(
                referral.addAffiliat(sig.v, sig.r, sig.s, nullstr)
            ).to.be.revertedWith(
                'WQReferral: affiliat cannot be zero address'
            )
        });

        it('TEST 2: Add affiliat for worker, revert 2: if affiliat is msg.sender', async () => {
            await expect(
                referral.connect(worker).addAffiliat(sig.v, sig.r, sig.s, worker.address)
            ).to.be.revertedWith(
                'WQReferral: affiliat cannot be sender address'
            )
        });

        it('TEST 3: Add affiliat for worker, revert 3: if referal has got affiliat yet', async () => {
            referral.connect(worker).addAffiliat(sig.v, sig.r, sig.s, affiliat.address)
            await expect(
                referral.connect(worker).addAffiliat(sig.v, sig.r, sig.s, affiliat.address)
            ).to.be.revertedWith('WQReferral: Address is already registered')
        });

        it('TEST 4: Add affiliat for worker, normal operation', async () => {
            // TODO
            await referral.connect(worker).addAffiliat(sig.v, sig.r, sig.s, affiliat.address)
            expect(
                await referral.connect(worker).hasAffiliat(worker.address)
            ).to.be.equals(true);
            // expect( referal[0]).to.be.equal(affiliat.address);
        });

        it('TEST 5: PayRefferal, revert 1: if Balance on contract is too low', async () => {
            await expect(
                referral.connect(employer).payReferral(worker.address)
            ).to.be.revertedWith('WQReferral: Balance on contract too low')
        });

        it('TEST 6: PayRefferal, revert 2: if Bonus is alresdy paid', async () => {
            await wqt_token
                .connect(work_quest_owner)
                .transfer(referral.address, oneK)
            await referral.connect(worker).addAffiliat(sig.v, sig.r, sig.s, affiliat.address)
            await referral.connect(employer).payReferral(worker.address)
            await expect(
                referral.connect(employer).payReferral(worker.address)
            ).to.be.revertedWith('WQReferral: Bonus already paid')
        });

        it("TEST 7: PayRefferal, revert 3: if refferal hasn't got affiliat", async () => {
            await wqt_token.connect(work_quest_owner).transfer(referral.address, oneK)
            await expect(
                referral.connect(employer).payReferral(worker.address)
            ).to.be.revertedWith('WQReferral: Address is not registered')
        });

        it('TEST 8: PayRefferal, normal operation', async () => {
            // TODO
            let balanceOfRefferal = await wqt_token.balanceOf(referral.address)
            let balanceOfAffiliat = await wqt_token.balanceOf(affiliat.address)
            // console.log(`balance of refferal is ${balanceOfRefferal}`)
            // console.log(`balance of affiliat is ${balanceOfAffiliat}`)

            referral.connect(worker).addAffiliat(sig.v, sig.r, sig.s, affiliat.address)
            expect(referral.connect(employer).payReferral(worker.address))
                .to.emit(referral, 'PaidReferral')
                .withArgs(worker.address, affiliat.address, referalBonus)
        });
    });
});