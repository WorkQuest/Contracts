const { expect } = require('chai')
const { ethers, web3 } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')
const {
    time,
    loadFixture,
} = require('@nomicfoundation/hardhat-network-helpers')
const BigNumber = require('bignumber.js')
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs')

const toWei = (value) => ethers.utils.parseUnits(value, 18)
const toBN = (num) => {
    if (typeof num == 'string') return new BigNumber(num)
    return new BigNumber(num.toString())
}

const oneDay = 24 * 60 * 60 // 1 day
const SEVEN_DAYS = 14 * 24 * 60 * 60
const sixtyDays = 5184000 // 60 * 24 * 60 * 60 // 2592000 == 60days
const YEAR = 31536000
const oneK = toWei('1000')
const SAVING_PRODUCT_FEE_PER_MONTH = toWei('0.024') // 1200000000000000
const SAVING_PRODUCT_FEE_WITHDRAW = toWei('0.05') // 5000000000000000
const days60 = toWei('0.0531')
const days90 = toWei('0.0548')
const days120 = toWei('0.0566')
const days150 = toWei('0.06')
const days180 = toWei('0.065')

let owner, borrower, feeReceiver, alice, bob
let saving
let wusd_token

describe('Saving Product test', function () {
    async function deployWithFixture() {
        ;[owner, feeReceiver, borrower, alice, bob] = await ethers.getSigners()

        const BridgeToken = await ethers.getContractFactory('WQBridgeToken')
        wusd_token = await upgrades.deployProxy(
            BridgeToken,
            ['WUSD stablecoin', 'WUSD', 18],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await wusd_token.deployed()
        await wusd_token.grantRole(
            await wusd_token.MINTER_ROLE(),
            owner.address
        )
        await wusd_token.mint(alice.address, oneK)
        await wusd_token.mint(bob.address, oneK)

        const Saving = await hre.ethers.getContractFactory('WQSavingProduct')
        saving = await upgrades.deployProxy(
            Saving,
            [
                wusd_token.address,
                feeReceiver.address,
                SAVING_PRODUCT_FEE_PER_MONTH,
                SAVING_PRODUCT_FEE_WITHDRAW,
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await saving.deployed()

        await saving.grantRole(await saving.BORROWER_ROLE(), borrower.address)
        await saving.setApy(60, days60)
        await saving.setApy(90, days90)
        await saving.setApy(120, days120)
        await saving.setApy(150, days150)
        await saving.setApy(180, days180)

        await wusd_token.connect(alice).approve(saving.address, oneK)
        await wusd_token.connect(bob).approve(saving.address, oneK)

        return {
            owner,
            borrower,
            feeReceiver,
            alice,
            bob,
            saving,
            wusd_token,
        }
    }

    describe('Saving Product: deploy', function () {
        it('STEP 1: check APYS', async function () {
            const {
                owner,
                borrower,
                feeReceiver,
                alice,
                bob,
                saving,
                wusd_token,
            } = await loadFixture(deployWithFixture)

            expect(await saving.apys(60)).equal(days60)
            expect(await saving.apys(90)).equal(days90)
            expect(await saving.apys(120)).equal(days120)
            expect(await saving.apys(150)).equal(days150)
            expect(await saving.apys(180)).equal(days180)
            expect(
                await saving.hasRole(
                    await saving.DEFAULT_ADMIN_ROLE(),
                    owner.address
                )
            ).equal(true)
        })

        it('STEP 2: check ROLES', async function () {
            const {
                owner,
                borrower,
                feeReceiver,
                alice,
                bob,
                saving,
                wusd_token,
            } = await loadFixture(deployWithFixture)

            expect(
                await saving.hasRole(await saving.ADMIN_ROLE(), owner.address)
            ).equal(true)
            expect(
                await saving.hasRole(
                    await saving.UPGRADER_ROLE(),
                    owner.address
                )
            ).equal(true)
        })
    })

    describe('Saving Product: success execution', function () {
        it('STEP 1: Deposit', async function () {
            const {
                owner,
                borrower,
                feeReceiver,
                alice,
                bob,
                saving,
                wusd_token,
            } = await loadFixture(deployWithFixture)
            const aliceAmount = toWei('100')
            let balanceBefore = await wusd_token.balanceOf(alice.address)

            const tx = await saving.connect(alice).deposit(60, aliceAmount)
            const ts = await getTimestamp(tx.blockNumber)
            let balanceAfter = await wusd_token.balanceOf(alice.address)

            let wallet_info = await saving.wallets(alice.address)
            expect(wallet_info.amount).to.eq(aliceAmount.toString())
            expect(wallet_info.rewardAllowed).to.eq(0)
            expect(wallet_info.rewardDistributed).to.eq(0)
            expect(wallet_info.unlockDate).equal(ts + sixtyDays)
            expect(
                toBN(balanceBefore).minus(toBN(aliceAmount)).toString()
            ).to.eq(balanceAfter.toString())
        })

        it('STEP 2: Withdraw', async function () {
            const {
                owner,
                borrower,
                feeReceiver,
                alice,
                bob,
                saving,
                wusd_token,
            } = await loadFixture(deployWithFixture)

            const aliceAmount = toWei('100')
            await saving.connect(alice).deposit(60, aliceAmount)
            await hre.ethers.provider.send('evm_setNextBlockTimestamp', [
                (await getCurrentTimestamp()) + sixtyDays + 1,
            ])

            let wallet_info0 = await saving.wallets(alice.address)
            const walletServiceComission = wallet_info0.serviceComission
            const walletAmount = wallet_info0.amount

            let balanceBefore = await wusd_token.balanceOf(alice.address)

            await saving.connect(alice).withdraw(aliceAmount)

            const closeComission = toBN(aliceAmount)
                .multipliedBy(toBN(SAVING_PRODUCT_FEE_WITHDRAW))
                .div(toBN(1e18))
            const serviceComission = toBN(aliceAmount)
                .multipliedBy(toBN(walletServiceComission))
                .div(toBN(walletAmount))

            let balanceAfter = await wusd_token.balanceOf(alice.address)

            let wallet_info = await saving.wallets(alice.address)
            expect(wallet_info.amount).equal(0)
            expect(wallet_info.rewardAllowed).equal(0)
            expect(wallet_info.rewardDistributed).equal(0)
            expect(
                toBN(balanceBefore)
                    .plus(
                        toBN(aliceAmount)
                            .minus(toBN(closeComission))
                            .minus(toBN(serviceComission))
                    )
                    .toString()
            ).to.eq(toBN(balanceAfter).toString())
        })

        it('STEP 3: Borrow funds', async function () {
            const {
                owner,
                borrower,
                feeReceiver,
                alice,
                bob,
                saving,
                wusd_token,
            } = await loadFixture(deployWithFixture)

            const aliceAmount = toWei('100')
            const borrowAmount = toWei('50')
            await saving.connect(alice).deposit(60, aliceAmount)
            await saving
                .connect(borrower)
                .borrow(alice.address, borrowAmount, SEVEN_DAYS)
            expect((await saving.wallets(alice.address)).borrowed).to.eq(
                borrowAmount
            )
        })

        it.only('STEP 4: Refund loans', async () => {
            await saving.connect(accounts[1]).deposit(14, parseEther('1'))
            await saving
                .connect(accounts[2])
                .borrow(accounts[1].address, parseEther('1'), 7)
            let current = await getTimestamp()
            await hre.ethers.provider.send('evm_setNextBlockTimestamp', [
                current + YEAR,
            ])
            await saving
                .connect(accounts[2])
                .refund(accounts[1].address, parseEther('1'), YEAR, 7)
            expect(
                (await saving.wallets(accounts[1].address)).rewardAllowed
            ).equal(parseEther('0.0531'))
        })

        it('STEP 5: Claim rewards', async () => {
            await saving.connect(accounts[1]).deposit(14, parseEther('1'))
            await saving
                .connect(accounts[2])
                .borrow(accounts[1].address, parseEther('1'), 7)
            let current = await getTimestamp()
            await hre.ethers.provider.send('evm_setNextBlockTimestamp', [
                current + YEAR,
            ])
            await saving
                .connect(accounts[2])
                .refund(accounts[1].address, parseEther('1'), YEAR, 7)
            let wallet_info = await saving.wallets(accounts[1].address)
            expect(wallet_info.amount).equal(parseEther('1'))
            expect(wallet_info.rewardAllowed).equal(parseEther('0.0531'))
            let balanceBefore = BigInt(
                await wusd_token.balanceOf(accounts[1].address)
            )
            await saving.connect(accounts[1]).claim()
            let balanceAfter = BigInt(
                await wusd_token.balanceOf(accounts[1].address)
            )
            expect(balanceAfter - balanceBefore).equal(parseEther('0.0531'))
        })
    })

    describe('Saving Product: failed execution', () => {
        it('STEP 1: Withdraw exceed amount', async () => {
            await expect(saving.withdraw(parseEther('1'))).revertedWith(
                'WQSavingProduct: Amount is invalid'
            )
        })

        it('STEP 2: Withdraw when funds locked', async () => {
            await saving.connect(accounts[1]).deposit(14, parseEther('1'))
            await expect(
                saving.connect(accounts[1]).withdraw(parseEther('1'))
            ).revertedWith('WQSavingProduct: Lock time is not over yet')
        })

        it('STEP 3: Borrow exceed amount', async () => {
            await expect(
                saving
                    .connect(accounts[2])
                    .borrow(accounts[1].address, parseEther('1'), 7)
            ).revertedWith('WQSavingProduct: Invalid amount')
        })

        it('STEP 3: Borrow with invalid duration', async () => {
            await saving.connect(accounts[1]).deposit(14, parseEther('1'))
            await expect(
                saving
                    .connect(accounts[2])
                    .borrow(accounts[1].address, parseEther('1'), 15)
            ).revertedWith('WQSavingProduct: Invalid duration')
        })

        it('STEP 4: Refund with invalid duration', async () => {
            await saving.connect(accounts[1]).deposit(14, parseEther('1'))
            await saving
                .connect(accounts[2])
                .borrow(accounts[1].address, parseEther('1'), 7)
            let currrent = await getTimestamp()
            await hre.ethers.provider.send('evm_setNextBlockTimestamp', [
                currrent + YEAR,
            ])
            await expect(
                saving
                    .connect(accounts[2])
                    .refund(accounts[1].address, parseEther('1'), YEAR, 6)
            ).revertedWith('WQSavingProduct: invalid duration')
        })
    })

    async function getCurrentTimestamp() {
        let block = await web3.eth.getBlock(await web3.eth.getBlockNumber())
        return block.timestamp
    }
    async function getTimestamp(bn) {
        return (await ethers.provider.getBlock(bn)).timestamp
    }
})
