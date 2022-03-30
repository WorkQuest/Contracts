const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });
const Web3 = require('web3');
const { parseEther } = require("ethers/lib/utils");
const { wordlists } = require("@ethersproject/wordlists");
const web3 = new Web3(hre.network.provider);
const SEVEN_DAYS = 7 * 24 * 60 * 60;
const YEAR = 31536000;


async function getTimestamp() {
    let blockNumber = await hre.ethers.provider.send("eth_blockNumber", []);
    let txBlockNumber = await hre.ethers.provider.send("eth_getBlockByNumber", [blockNumber, false]);
    return parseInt(new BigNumber(txBlockNumber.timestamp).toString());
}

describe("Saving Product test", () => {
    let saving;
    beforeEach(async () => {
        accounts = await ethers.getSigners();
        const Saving = await hre.ethers.getContractFactory("WQSavingProduct");
        saving = await upgrades.deployProxy(Saving, [], { initializer: 'initialize', kind: 'transparent' });
        await saving.grantRole(await saving.BORROWER_ROLE(), accounts[2].address);
        await saving.setApy(7, parseEther("0.0531"));
        await saving.setApy(14, parseEther("0.0548"));
        await saving.setApy(30, parseEther("0.0566"));
        await saving.setApy(90, parseEther("0.06"));
        await saving.setApy(180, parseEther("0.065"));
    });

    describe('Saving Product: deploy', () => {
        it('STEP 1:', async () => {
            expect(await saving.apys(7)).equal(parseEther("0.0531"));
            expect(await saving.apys(14)).equal(parseEther("0.0548"));
            expect(await saving.apys(30)).equal(parseEther("0.0566"));
            expect(await saving.apys(90)).equal(parseEther("0.06"));
            expect(await saving.apys(180)).equal(parseEther("0.065"));
            expect(await saving.hasRole(await saving.DEFAULT_ADMIN_ROLE(), accounts[0].address)).equal(true);
            expect(await saving.hasRole(await saving.ADMIN_ROLE(), accounts[0].address)).equal(true);
            expect(await saving.hasRole(await saving.UPGRADER_ROLE(), accounts[0].address)).equal(true);
        });
    });

    describe('Saving Product: success execution', () => {
        it('STEP 1: Deposit', async () => {
            let balanceBefore = await web3.eth.getBalance(accounts[1].address);
            await saving.connect(accounts[1]).deposit(7, { value: parseEther('1') });
            let balanceAfter = await web3.eth.getBalance(accounts[1].address);
            let wallet_info = await saving.wallets(accounts[1].address);
            expect(wallet_info.amount).equal(parseEther('1'));
            expect(wallet_info.rewardAllowed).equal(parseEther('0'));
            expect(wallet_info.rewardDebt).equal(parseEther('0'));
            expect(wallet_info.rewardDistributed).equal(parseEther('0'));
            expect(wallet_info.unlockDate).equal(await getTimestamp() + SEVEN_DAYS);
            expect(((balanceBefore - balanceAfter) / 1e18).toFixed(2)).equal('1.00');
        });

        it('STEP 2: Withdraw', async () => {
            await saving.connect(accounts[1]).deposit(7, { value: parseEther('1') });
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + SEVEN_DAYS]);
            let balanceBefore = await web3.eth.getBalance(accounts[1].address);
            await saving.connect(accounts[1]).withdraw(parseEther('1'));
            let balanceAfter = await web3.eth.getBalance(accounts[1].address);
            let wallet_info = await saving.wallets(accounts[1].address);
            expect(wallet_info.amount).equal(parseEther('0'));
            expect(wallet_info.rewardAllowed).equal(parseEther('0'));
            expect(wallet_info.rewardDebt).equal(parseEther('0'));
            expect(wallet_info.rewardDistributed).equal(parseEther('0'));
            expect(((balanceAfter - balanceBefore) / 1e18).toFixed(2)).equal('1.00');
        });

        it('STEP 3: Borrow funds', async () => {
            await saving.connect(accounts[1]).deposit(7, { value: parseEther('1') });
            await saving.connect(accounts[2]).borrow(parseEther('1'));
            expect(await saving.borrowed()).equal(parseEther('1'));
        });

        it('STEP 4: Refund loans', async () => {
            await saving.connect(accounts[1]).deposit(7, { value: parseEther('1') });
            await saving.connect(accounts[2]).borrow(parseEther('1'));
            let current = await getTimestamp();
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [current + YEAR]);
            await saving.connect(accounts[2]).refund(parseEther('1'), YEAR, 7, { value: parseEther('1.0531') });
            expect(await saving.rewardsProduced()).equal(parseEther('0.0531'));
        });

        it('STEP 5: Claim rewards', async () => {
            await saving.connect(accounts[1]).deposit(7, { value: parseEther('1') });
            await saving.connect(accounts[2]).borrow(parseEther('1'));
            let current = await getTimestamp();
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [current + YEAR]);
            await saving.connect(accounts[2]).refund(parseEther('1'), YEAR, 7, { value: parseEther('1.0531') });
            let wallet_info = await saving.wallets(accounts[1].address);
            expect(wallet_info.amount).equal(parseEther('1'));
            expect(await saving.rewardsProduced()).equal(parseEther('0.0531'));
            let balanceBefore = await web3.eth.getBalance(accounts[1].address);
            await saving.connect(accounts[1]).claim();
            let balanceAfter = await web3.eth.getBalance(accounts[1].address);
            expect(((balanceAfter - balanceBefore) / 1e18).toFixed(4)).equal('0.0531');
        });
    });

    describe('Saving Product: failed execution', () => {
        it('STEP 1: Withdraw exceed amount', async () => {
            await expect(
                saving.withdraw(parseEther('1'))
            ).revertedWith("WQSavingProduct: Amount is invalid");
        });

        it('STEP 2: Withdraw when funds locked', async () => {
            await saving.connect(accounts[1]).deposit(7, { value: parseEther('1') });
            await expect(
                saving.connect(accounts[1]).withdraw(parseEther('1'))
            ).revertedWith("WQSavingProduct: Lock time is not over yet");
        });

        it('STEP 3: Borrow exceed amount', async () => {
            await expect(
                saving.connect(accounts[2]).borrow(parseEther('1'))
            ).revertedWith("WQSavingProduct: Insufficient amount");
        });

        it('STEP 4: Refund insufficient amount', async () => {
            await saving.connect(accounts[1]).deposit(7, { value: parseEther('1') });
            await saving.connect(accounts[2]).borrow(parseEther('1'));
            let currrent = await getTimestamp();
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [currrent + YEAR]);
            await expect(
                saving.connect(accounts[2]).refund(parseEther('1'), YEAR, 7, { value: parseEther('1.053') })
            ).revertedWith("WQSavingProduct: Insufficient rewards");;
        });

        it('STEP 5: Refund with invalid duration', async () => {
            await saving.connect(accounts[1]).deposit(7, { value: parseEther('1') });
            await saving.connect(accounts[2]).borrow(parseEther('1'));
            let currrent = await getTimestamp();
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [currrent + YEAR]);
            await expect(
                saving.connect(accounts[2]).refund(parseEther('1'), YEAR, 6, { value: parseEther('1.0531') })
            ).revertedWith("WQSavingProduct: invalid duration");;
        });
    });
});
