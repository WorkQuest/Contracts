const Web3 = require('web3')
const { expect } = require('chai')
const { ethers, web3 } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')
const {
    time,
    loadFixture,
} = require('@nomicfoundation/hardhat-network-helpers')
const BigNumber = require('bignumber.js')

const FIXED_RATE = parseEther('0.013')
const PENSION_LOCK_TIME = 94608000
const PENSION_DEFAULT_FEE = parseEther('0.05')
const VALID_TIME = 600
const YEAR = 31536000
const PENSION_FEE_PER_MONTH = parseEther('0.0012')
const PENSION_FEE_WITHDRAW = parseEther('0.005')
const BORROWING_FEE = parseEther('0.005')
const AUCTION_DURATION = 1800
const UPPER_BOUND_COST = parseEther('1.2')
const LOWER_BOUND_COST = parseEther('0.95')
const SYMBOL_ETH = 'ETH'
const SYMBOL_WUSD = 'WUSD'
const PRICE_ETH = parseEther('30')
const oneK = parseEther('1000')

const toBN = (num) => {
    if (typeof num == 'string') return new BigNumber(num)
    return new BigNumber(num.toString())
}
const toWei = (value) => ethers.utils.parseUnits(value, 18)

let nonce = 1
let depositor
let borrower
let service
let buyer
let feeReceiver
let eth_token
let wusd_token
let priceOracle
let pension
let borrowing
let pension_fund

describe('Borrowing test', function () {
    async function deployWithFixture() {
        ;[owner, depositor, borrower, service, buyer, feeReceiver] =
            await ethers.getSigners()

        const PriceOracle = await ethers.getContractFactory('WQPriceOracle')
        priceOracle = await upgrades.deployProxy(
            PriceOracle,
            [service.address, VALID_TIME],
            { kind: 'transparent' }
        )

        await priceOracle.deployed()
        await priceOracle.updateToken(1, SYMBOL_ETH)

        await oracleSetPrice(PRICE_ETH, SYMBOL_ETH)

        // ========================================================================================

        const BridgeToken = await ethers.getContractFactory('WorkQuestToken')
        eth_token = await upgrades.deployProxy(
            BridgeToken,
            ['ETH WQ wrapped', SYMBOL_ETH, 18],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await eth_token.deployed()
        await eth_token.grantRole(await eth_token.MINTER_ROLE(), owner.address)
        await eth_token.mint(borrower.address, oneK)

        wusd_token = await upgrades.deployProxy(
            BridgeToken,
            ['WUSD stablecoin', SYMBOL_WUSD, 18],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await wusd_token.deployed()
        await wusd_token.grantRole(
            await wusd_token.MINTER_ROLE(),
            owner.address
        )

        // ========================================================================================

        const PensionFund = await ethers.getContractFactory('WQPensionFund')
        pension_fund = await upgrades.deployProxy(
            PensionFund,
            [
                PENSION_LOCK_TIME,
                PENSION_DEFAULT_FEE,
                wusd_token.address,
                feeReceiver.address,
                PENSION_FEE_PER_MONTH,
                PENSION_FEE_WITHDRAW,
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await pension_fund.deployed()
        await pension_fund.setApy(7, parseEther('0.0644'))

        // ========================================================================================

        const Borrowing = await ethers.getContractFactory('WQBorrowing')
        borrowing = await upgrades.deployProxy(
            Borrowing,
            [
                FIXED_RATE,
                BORROWING_FEE,
                AUCTION_DURATION,
                UPPER_BOUND_COST,
                LOWER_BOUND_COST,
                priceOracle.address,
                wusd_token.address,
                feeReceiver.address,
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )

        await borrowing.setApy(7, parseEther('0.1594'))
        await borrowing.setToken(eth_token.address, SYMBOL_ETH)
        await pension_fund.grantRole(
            await pension_fund.BORROWER_ROLE(),
            borrowing.address
        )
        await borrowing.addFund(pension_fund.address)

        await eth_token
            .connect(borrower)
            .approve(borrowing.address, parseEther('200'))
        await wusd_token
            .connect(owner)
            .mint(depositor.address, parseEther('400'))
        await wusd_token
            .connect(depositor)
            .approve(pension_fund.address, parseEther('400'))
        await pension_fund
            .connect(depositor)
            .contribute(depositor.address, parseEther('400'))
        await wusd_token.mint(buyer.address, parseEther('200'))

        // ========================================================================================

        return {
            owner,
            depositor,
            borrower,
            service,
            buyer,
            feeReceiver,
            priceOracle,
            wusd_token,
            eth_token,
            pension_fund,
            borrowing,
            eth_token,
        }
    }

    describe('Borrowing: deploy', function () {
        it('Should be set all variables and roles', async function () {
            const {
                owner,
                depositor,
                borrower,
                service,
                buyer,
                feeReceiver,
                priceOracle,
                wusd_token,
                eth_token,
                pension,
                borrowing,
            } = await loadFixture(deployWithFixture)

            expect(await borrowing.oracle()).to.eq(priceOracle.address)
            expect(await borrowing.fixedRate()).equal(FIXED_RATE)
            expect(
                await borrowing.hasRole(
                    await borrowing.DEFAULT_ADMIN_ROLE(),
                    owner.address
                )
            ).equal(true)
            expect(
                await borrowing.hasRole(
                    await borrowing.ADMIN_ROLE(),
                    owner.address
                )
            ).equal(true)
            expect(
                await borrowing.hasRole(
                    await borrowing.UPGRADER_ROLE(),
                    owner.address
                )
            ).equal(true)
        })
    })

    describe('Borrowing: success execution', () => {
        it('STEP 1: Borrow', async function(){
            const {
                owner,
                depositor,
                borrower,
                service,
                buyer,
                feeReceiver,
                priceOracle,
                wusd_token,
                eth_token,
                pension,
                borrowing,
            } = await loadFixture(deployWithFixture)

            const credit = parseEther("200") 
            const balanceWusdBefore = await wusd_token.balanceOf(borrower.address);
            const balanceEthBefore = await eth_token.balanceOf(borrower.address); 

            await borrowing.connect(borrower).borrow(1, depositor.address, credit, 0, 7, SYMBOL_ETH);

            const balanceWusdAfter = await wusd_token.balanceOf(borrower.address);
            const balanceEthAfter = await eth_token.balanceOf(borrower.address); 
            expect(((balanceEthBefore - balanceEthAfter) / 1e18).toFixed(2)).equal('10.00');
            expect(((balanceWusdAfter - balanceWusdBefore) / 1e18)).to.eq(credit / 1e18);
        });

        it('STEP 2: Refund', async function(){
            const {
                owner,
                depositor,
                borrower,
                service,
                buyer,
                feeReceiver,
                priceOracle,
                wusd_token,
                eth_token,
                pension,
                borrowing,
            } = await loadFixture(deployWithFixture)

            const credit = parseEther("200") 
            const amount = parseEther("36")

            await borrowing.connect(borrower).borrow(1, depositor.address, credit, 0, 7, SYMBOL_ETH);
            await wusd_token.mint(borrower.address, amount);
            await wusd_token.connect(borrower).approve(borrowing.address, credit + amount);
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + YEAR]);
            let balanceBefore = await wusd_token.balanceOf(borrower.address);
            let balanceEthBefore = await eth_token.balanceOf(borrower.address);
            await borrowing.connect(borrower).refund(0, parseEther("200"));
            let balanceAfter = await wusd_token.balanceOf(borrower.address);
            let balanceEthAfter = await eth_token.balanceOf(borrower.address);
            expect(((balanceEthAfter - balanceEthBefore) / 1e18).toFixed(2)).equal('10.00');
            expect(((balanceBefore - balanceAfter) / 1e18).toFixed(2)).equal('235.48');
        });


    });

    async function oracleSetPrice(price, symbol) {
        nonce += 1
        let message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: [price.toString()] },
            { t: 'uint256', v: [parseEther('2').toString()] },
            { t: 'string', v: [symbol] }
        )
        let signature = await web3.eth.sign(message, service.address)

        let sig = ethers.utils.splitSignature(signature)
        let current_timestamp = (
            await web3.eth.getBlock(await web3.eth.getBlockNumber())
        ).timestamp

        ethers.provider.send('evm_setNextBlockTimestamp', [
            current_timestamp + VALID_TIME,
        ])
        await priceOracle.setTokenPricesUSD(
            nonce,
            sig.v,
            sig.r,
            sig.s,
            [price],
            [parseEther('2').toString()],
            [symbol]
        )
        await hre.ethers.provider.send('evm_mine', [])
    }

    async function getCurrentTimestamp() {
        let block = await web3.eth.getBlock(await web3.eth.getBlockNumber())
        return block.timestamp
    }

    async function getTimestamp() {
        let blockNumber = await ethers.provider.send('eth_blockNumber', [])
        let txBlockNumber = await ethers.provider.send('eth_getBlockByNumber', [
            blockNumber,
            false,
        ])
        return parseInt(new BigNumber(txBlockNumber.timestamp).toString())
    }
})
