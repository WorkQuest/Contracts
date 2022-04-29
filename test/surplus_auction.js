const Web3 = require('web3')
const { expect } = require('chai')
const { ethers } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')

const STABILITY_FEE = parseEther("0.1"); //10%
const ANNUAL_INTEREST_RATE = parseEther("0.0");
const VALID_TIME = 600;
const SYMBOL = "ETH";
const ETH_PRICE = parseEther("30"); // 1 wETH token = 30 WUSD
const WQT_PRICE = parseEther("0.3");
const UPPER_ETH_PRICE = parseEther("40");
const LIQUIDATE_TRESHOLD = parseEther("1.2"); // 120%
const START_PRICE_FACTOR = parseEther("1.2");
const AUCTION_DURATION = "1800"; // 5 min
const PRICE_INDEX_STEP = parseEther("1"); // 1 WUSD
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const UPPER_BOUND_FACTOR = parseEther("1.2");
const LOWER_BOUND_FACTOR = parseEther("0.95");
const MAX_LOT_AMOUNT_FACTOR = parseEther("0.9");
const ONE_ADDRESS = "0x0000000000000000000000000000000000000001";
const ONE = "1";
const MIN_RATIO = parseEther("1.5");

const LotStatus = Object.freeze({
    Unknown: 0,
    Auctioned: 1,
    Selled: 2,
})

describe('Surplus auction test', () => {
    let priceOracle;
    let weth;
    let wqt;
    let router;
    let collateralAuction;
    let surplusAuction;
    let nonce = 1;
    let owner;
    let user1;
    let user2;
    let service;
    let feeReceiver;

    async function getCurrentTimestamp() {
        let block = await web3.eth.getBlock(await web3.eth.getBlockNumber());
        return block.timestamp;
    }

    async function oracleSetPrice(price, symbol) {
        await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getCurrentTimestamp() + VALID_TIME / 2]);
        await hre.ethers.provider.send("evm_mine", []);
        nonce += 1;
        let message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: price.toString() },
            { t: 'string', v: symbol }
        );
        let signature = await web3.eth.sign(message, service.address);
        let sig = ethers.utils.splitSignature(signature);
        await priceOracle.setTokenPriceUSD(nonce, price, sig.v, sig.r, sig.s, symbol);
    }

    beforeEach(async () => {
        [owner, user1, user2, service, feeReceiver] = await ethers.getSigners();

        const PriceOracle = await hre.ethers.getContractFactory('WQPriceOracle');
        priceOracle = await upgrades.deployProxy(PriceOracle,
            [
                service.address,
                VALID_TIME
            ],
            { kind: 'transparent' });
        await priceOracle.deployed();
        await priceOracle.updateToken(1, SYMBOL);
        await priceOracle.updateToken(1, "WQT");

        await oracleSetPrice(ETH_PRICE, SYMBOL);
        await oracleSetPrice(WQT_PRICE, "WQT");

        const wETH = await ethers.getContractFactory('wETH');
        weth = await wETH.deploy();
        await weth.transfer(user1.address, parseEther("1000"));
        await weth.transfer(user2.address, parseEther("1000"));

        const WQT = await ethers.getContractFactory('WQT');
        wqt = await WQT.deploy();

        const Router = await ethers.getContractFactory('WQRouter');
        router = await upgrades.deployProxy(Router,
            [
                priceOracle.address,
                wqt.address,
                STABILITY_FEE,
                ANNUAL_INTEREST_RATE,
                feeReceiver.address
            ],
            { kind: 'transparent' });
        // Transfer wqt tokens
        await wqt.transfer(router.address, parseEther("10000"));
        await wqt.transfer(user1.address, parseEther("10000"));
        await wqt.transfer(user2.address, parseEther("10000"));

        const ColateralAuction = await ethers.getContractFactory('WQCollateralAuction');
        collateralAuction = await upgrades.deployProxy(
            ColateralAuction,
            [
                weth.address,
                priceOracle.address,
                router.address,
                LIQUIDATE_TRESHOLD,
                START_PRICE_FACTOR,
                parseEther("1"),
                AUCTION_DURATION,
                PRICE_INDEX_STEP
            ],
            { kind: 'transparent' });
        await router.setToken(1, weth.address, collateralAuction.address, MIN_RATIO, SYMBOL);

        const SurplusAuction = await ethers.getContractFactory('WQSurplusAuction');
        surplusAuction = await upgrades.deployProxy(
            SurplusAuction,
            [
                priceOracle.address,
                router.address,
                AUCTION_DURATION,
                UPPER_BOUND_FACTOR,
                LOWER_BOUND_FACTOR,
                MAX_LOT_AMOUNT_FACTOR
            ],
            { kind: 'transparent' });

        await router.setSurplusAuction(surplusAuction.address);
    });

    describe('Deployment', () => {
        it('STEP1: Should set the roles, addresses and variables', async () => {
            expect(await surplusAuction.oracle()).equal(priceOracle.address);
            expect(await surplusAuction.router()).equal(router.address);
            expect(await surplusAuction.auctionDuration()).equal(AUCTION_DURATION);
            expect(await surplusAuction.upperBoundCost()).equal(UPPER_BOUND_FACTOR);
            expect(await surplusAuction.lowerBoundCost()).equal(LOWER_BOUND_FACTOR);
            expect(await surplusAuction.maxLotAmountFactor()).equal(MAX_LOT_AMOUNT_FACTOR);
            expect(await surplusAuction.totalAuctioned()).equal(0);
            expect(
                await surplusAuction.hasRole(await surplusAuction.DEFAULT_ADMIN_ROLE(), owner.address)
            ).equal(true);
            expect(
                await surplusAuction.hasRole(await surplusAuction.ADMIN_ROLE(), owner.address)
            ).equal(true);
            expect(
                await surplusAuction.hasRole(await surplusAuction.UPGRADER_ROLE(), owner.address)
            ).equal(true);
            expect(
                await surplusAuction.getRoleAdmin(await surplusAuction.UPGRADER_ROLE())
            ).equal(await surplusAuction.ADMIN_ROLE());
        });
    });

    describe('Check start auction', () => {
        beforeEach(async () => {
            await oracleSetPrice(ETH_PRICE, SYMBOL);
            await weth.connect(user1).approve(router.address, parseEther("1"));
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);
            await oracleSetPrice(UPPER_ETH_PRICE, SYMBOL);
        });
        it('STEP1: Start auction: success', async () => {
            expect(await surplusAuction.getSurplusAmount()).equal("6666666666666666666");
            await surplusAuction.startAuction(parseEther("6"), SYMBOL);
            expect(await surplusAuction.totalAuctioned()).equal(parseEther("6"));

            let lot = await surplusAuction.lots(parseEther("6"));
            expect(lot.buyer).equal(NULL_ADDRESS);
            expect(lot.amount).equal(parseEther("6"));
            expect(lot.index).equal(0);
            expect(lot.endTime).equal(parseInt(await getCurrentTimestamp()) + parseInt(AUCTION_DURATION));
            expect(lot.status).equal(LotStatus.Auctioned);
            expect(await surplusAuction.amounts(0)).equal(parseEther("6"));
        });

        it('STEP2: Start auction when amount greater than totalSurplus: fail', async () => {
            await surplusAuction.startAuction(parseEther("5"), SYMBOL);
            await expect(
                surplusAuction.startAuction(parseEther("2"), SYMBOL)
            ).revertedWith("WQAuction: Amount of bid is greater than total surplus");
        });

        it('STEP3: Start auction when amount/totalSurplus greater than 90%', async () => {
            await expect(
                surplusAuction.startAuction(parseEther("6.1"), SYMBOL)
            ).revertedWith("WQAuction: Auction of this lot is temporarily suspended");
        });
        it('STEP4: Start auction with incorrect amount', async () => {
            await expect(
                surplusAuction.startAuction(0, SYMBOL)
            ).revertedWith("WQAuction: Incorrect amount value");
        });
    });
    describe('Check buy lot', () => {
        beforeEach(async () => {
            await oracleSetPrice(ETH_PRICE, SYMBOL);
            await weth.connect(user1).approve(router.address, parseEther("1"));
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);
            await oracleSetPrice(UPPER_ETH_PRICE, SYMBOL);
            await wqt.connect(user2).approve(router.address, parseEther("10000"));
        });
        it('STEP1: Buy lot: success', async () => {
            await surplusAuction.startAuction(parseEther("6"), SYMBOL);
            let lot = await surplusAuction.lots(parseEther("6"));
            expect(lot.status).equal(LotStatus.Auctioned);
            expect(await surplusAuction.amounts(0)).equal(parseEther("6"));

            await ethers.provider.send("evm_setNextBlockTimestamp", [parseInt(lot.endTime - 901)]);
            await ethers.provider.send("evm_mine", []);

            await oracleSetPrice(UPPER_ETH_PRICE, SYMBOL);
            await oracleSetPrice(WQT_PRICE, "WQT");

            let balanceWUSDBefore = await ethers.provider.getBalance(user2.address);
            let balanceWQTBefore = await wqt.balanceOf(user2.address);
            await surplusAuction.connect(user2).buyLot(parseEther("6"), 0);
            let balanceWUSDAfter = await ethers.provider.getBalance(user2.address);
            let balanceWQTAfter = await wqt.balanceOf(user2.address);

            expect(((balanceWUSDAfter - balanceWUSDBefore) / 1e18).toFixed(2)).equal("6.00");
            expect(((balanceWQTBefore - balanceWQTAfter) / 1e18).toFixed(2)).equal("19.83");
            await expect(
                surplusAuction.getCurrentLotCost(parseEther("6"))
            ).revertedWith("WQAuction: This lot is not auctioned");
            lot = await surplusAuction.lots(parseEther("6"));
            expect(lot.status).equal(LotStatus.Selled);
            expect(lot.buyer).equal(user2.address);
            expect(lot.index).equal(0);
            expect(lot.amount).equal(parseEther("6"));
        });
        it('STEP2: Buy not auctioned lot: fail', async () => {
            await expect(
                surplusAuction.connect(user2).buyLot(parseEther("6"), 0)
            ).revertedWith("WQAuction: Lot is not auctioned");
        });
        it('STEP3: Buy lot when auction time is over: fail', async () => {
            await surplusAuction.startAuction(parseEther("6"), SYMBOL);
            let lot = await surplusAuction.lots(parseEther("6"));
            await ethers.provider.send("evm_setNextBlockTimestamp", [parseInt(lot.endTime) + 1]);
            await expect(
                surplusAuction.connect(user2).buyLot(parseEther("6"), 0)
            ).revertedWith("WQAuction: Auction time is over");
        });
        it('STEP4: Buy lot when price decreased: fail', async () => {
            await surplusAuction.startAuction(parseEther("6"), SYMBOL);
            await oracleSetPrice(parseEther("31"), SYMBOL);
            await expect(
                surplusAuction.connect(user2).buyLot(parseEther("6"), 0)
            ).revertedWith("WQAuction: Auction of this lot is temporarily suspended");
        });
        it('STEP5: Buy lot when cost is greater that maximum: fail', async () => {
            await surplusAuction.startAuction(parseEther("6"), SYMBOL);
            await oracleSetPrice(WQT_PRICE, "WQT");
            await expect(
                surplusAuction.connect(user2).buyLot(parseEther("6"), parseEther("18"))
            ).revertedWith("WQAuction: Current cost is greater maximum");
        });
    });
    describe('Admin functions', () => {
        it("STEP1: Set price oracle address", async () => {
            await surplusAuction.setOracle(ONE_ADDRESS);
            expect(
                await surplusAuction.oracle()
            ).equal(ONE_ADDRESS);
        });
        it("STEP2: Set router address", async () => {
            await surplusAuction.setRouter(ONE_ADDRESS);
            expect(
                await surplusAuction.router()
            ).equal(ONE_ADDRESS);
        });
        it("STEP3: Set wqt token address", async () => {
            await surplusAuction.setToken(ONE_ADDRESS);
            expect(
                await surplusAuction.token()
            ).equal(ONE_ADDRESS);
        });
        it("STEP4: Set duration of auction", async () => {
            await surplusAuction.setAuctionDuration(ONE);
            expect(
                await surplusAuction.auctionDuration()
            ).equal(ONE);
        });
        it("STEP5: Set factor of start coefficient of cost for dutch auction", async () => {
            await surplusAuction.setUpperBoundCost(ONE);
            expect(
                await surplusAuction.upperBoundCost()
            ).equal(ONE);
        });
        it("STEP6: Set factor of end coefficient of cost for dutch auction", async () => {
            await surplusAuction.setLowerBoundCost(ONE);
            expect(
                await surplusAuction.lowerBoundCost()
            ).equal(ONE);
        });
        it("STEP7: Set maximum percentage of the lot amount to the total amount of debt", async () => {
            await surplusAuction.setMaxLotAmountFactor(ONE);
            expect(
                await surplusAuction.maxLotAmountFactor()
            ).equal(ONE);
        });
    });
});