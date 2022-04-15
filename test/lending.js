const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });
const Web3 = require('web3');
const { parseEther } = require("ethers/lib/utils");
const { parse } = require("dotenv");
const web3 = new Web3(hre.network.provider);

const LENDING_APY = parseEther("0.0431");
const YEAR = 31536000;
const oneK = parseEther("1000");

async function getTimestamp() {
    let blockNumber = await hre.ethers.provider.send("eth_blockNumber", []);
    let txBlockNumber = await hre.ethers.provider.send("eth_getBlockByNumber", [blockNumber, false]);
    return parseInt(new BigNumber(txBlockNumber.timestamp).toString())
}

describe("Lending test", () => {
    let lending;
    let accounts;
    let wusd_token;

    beforeEach(async () => {
        accounts = await ethers.getSigners();

        const BridgeToken = await ethers.getContractFactory('WQBridgeToken');
        wusd_token = await upgrades.deployProxy(
            BridgeToken,
            ["WUSD stablecoin", "WUSD"],
            { initializer: 'initialize', kind: 'transparent' }
        );
        await wusd_token.deployed();
        await wusd_token.grantRole(await wusd_token.MINTER_ROLE(), accounts[0].address);
        await wusd_token.mint(accounts[1].address, oneK);
        await wusd_token.mint(accounts[2].address, oneK);

        const Lending = await hre.ethers.getContractFactory("WQLending");
        lending = await upgrades.deployProxy(
            Lending,
            [LENDING_APY, wusd_token.address],
            { initializer: 'initialize', kind: 'transparent' }
        );
        await lending.grantRole(await lending.BORROWER_ROLE(), accounts[2].address);

        await wusd_token.connect(accounts[1]).approve(lending.address, oneK);
        await wusd_token.connect(accounts[2]).approve(lending.address, oneK);
    });

    describe('STEP 1: Lending: deploy', () => {
        it('Should be set all variables and roles', async () => {
            expect(await lending.apys(0)).equal(LENDING_APY);
            expect(await lending.hasRole(await lending.DEFAULT_ADMIN_ROLE(), accounts[0].address)).equal(true);
            expect(await lending.hasRole(await lending.ADMIN_ROLE(), accounts[0].address)).equal(true);
            expect(await lending.hasRole(await lending.UPGRADER_ROLE(), accounts[0].address)).equal(true);
        });
    });

    describe('Lending: success execution', () => {
        it('STEP 1: deposit and create users wallet', async () => {
            let balanceBefore = BigInt(await wusd_token.balanceOf(accounts[1].address));
            await lending.connect(accounts[1]).deposit(parseEther('1'));
            let balanceAfter = BigInt(await wusd_token.balanceOf(accounts[1].address));
            let wallet_info = await lending.wallets(accounts[1].address);
            expect(wallet_info.amount).equal(parseEther('1'));
            expect(wallet_info.rewardAllowed).equal(parseEther('0'));
            expect(wallet_info.rewardDebt).equal(parseEther('0'));
            expect(wallet_info.rewardDistributed).equal(parseEther('0'));
            expect(balanceBefore - balanceAfter).equal(parseEther('1.00'));
        });

        it('STEP 2: withdraw', async () => {
            await lending.connect(accounts[1]).deposit(parseEther('1'));
            let balanceBefore = BigInt(await wusd_token.balanceOf(accounts[1].address));
            await lending.connect(accounts[1]).withdraw(parseEther('1'));
            let balanceAfter = BigInt(await wusd_token.balanceOf(accounts[1].address));
            let wallet_info = await lending.wallets(accounts[1].address);
            expect(wallet_info.amount).equal(parseEther('0'));
            expect(wallet_info.rewardAllowed).equal(parseEther('0'));
            expect(wallet_info.rewardDebt).equal(parseEther('0'));
            expect(wallet_info.rewardDistributed).equal(parseEther('0'));
            expect(balanceAfter - balanceBefore).equal(parseEther('1.00'));
        });

        it('STEP 3: borrow funds', async () => {
            await lending.connect(accounts[1]).deposit(parseEther('1'));
            await lending.connect(accounts[2]).borrow(parseEther('1'));
            expect(await lending.borrowed()).equal(parseEther('1'));
        });

        it('STEP 4: refund loans', async () => {
            await lending.connect(accounts[1]).deposit(parseEther('1'));
            await lending.connect(accounts[2]).borrow(parseEther('1'));
            let currrent = await getTimestamp();
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [currrent + YEAR]);
            await lending.connect(accounts[2]).refund(parseEther('1'), YEAR, 0);
            expect(await lending.rewardsProduced()).equal(parseEther('0.0431'));
        });

        it('STEP 5: claim rewards', async () => {
            await lending.connect(accounts[1]).deposit(parseEther('1'));
            await lending.connect(accounts[2]).borrow(parseEther('1'));
            let currrent = await getTimestamp();
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [currrent + YEAR]);
            await lending.connect(accounts[2]).refund(parseEther('1'), YEAR, 0);
            let wallet_info = await lending.wallets(accounts[1].address);
            expect(wallet_info.amount).equal(parseEther('1'));
            expect(await lending.rewardsProduced()).equal(parseEther('0.0431'));
            let balanceBefore = BigInt(await wusd_token.balanceOf(accounts[1].address));
            await lending.connect(accounts[1]).claim();
            let balanceAfter = BigInt(await wusd_token.balanceOf(accounts[1].address));
            expect(balanceAfter - balanceBefore).equal(parseEther('0.0431'));
        });
    });

    describe('Lending: failed execution', () => {
        it('STEP 1: withdraw exceed amount', async () => {
            await expect(
                lending.withdraw(parseEther('1'))
            ).revertedWith("WQDeposit: Amount is invalid");
        });

        it('STEP 2: borrow exceed amount', async () => {
            await expect(
                lending.connect(accounts[2]).borrow(parseEther('1'))
            ).revertedWith("WQLending: Insufficient amount");
        });
    });
});
