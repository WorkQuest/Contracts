const Web3 = require('web3')
const { expect } = require('chai')
const { ethers } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')

const STABILITY_FEE = parseEther("0.1"); //10%
const ANNUAL_INTEREST_RATE = parseEther("0.02"); //2%
const VALID_TIME = 1000;
const SYMBOL = "ETH";
const ETH_PRICE = parseEther("30"); // 1 wETH token = 30 WUSD
const WQT_PRICE = parseEther("0.3");
const UPPER_ETH_PRICE = parseEther("45");
const LOWER_ETH_PRICE = parseEther("15");
const LIQUIDATE_TRESHOLD = parseEther("1.4"); // 140%
const START_PRICE_FACTOR = parseEther("1.2");
const COLLATERAL_AUCTION_DURATION = "300"; // 5 min
const PRICE_INDEX_STEP = parseEther("1"); // 1 WUSD
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ADDRESS = "0x0000000000000000000000000000000000000001";
const ONE = "1";
const MIN_RATIO = parseEther("1.5");

const LotStatus = Object.freeze({
    Unknown: 0,
    New: 1,
    Auctioned: 2,
    Liquidated: 3
})

describe('Collateral auction test', () => {
    let Vault;
    let priceOracle;
    let weth;
    let router;
    let auction;
    let nonce = 1;
    let owner;
    let user1;
    let user2;
    let service;
    let likeRouter;
    let feeReceiver;

    async function oracleSetPrice(price, symbol) {
        nonce += 1;
        let message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: price.toString() },
            { t: 'string', v: symbol }
        );
        let signature = await web3.eth.sign(message, service.address);
        let sig = ethers.utils.splitSignature(signature);
        let cur_timestamp = (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp
        await ethers.provider.send("evm_setNextBlockTimestamp", [cur_timestamp + VALID_TIME]);
        await priceOracle.setTokenPriceUSD(nonce, price, sig.v, sig.r, sig.s, symbol);
        await hre.ethers.provider.send("evm_mine", []);
    }

    async function getCurrentTimestamp() {
        let block = await web3.eth.getBlock(await web3.eth.getBlockNumber());
        return block.timestamp;
    }

    beforeEach(async () => {
        [owner, user1, user2, service, likeRouter, feeReceiver] = await ethers.getSigners();

        const PriceOracle = await hre.ethers.getContractFactory('WQPriceOracle');
        priceOracle = await upgrades.deployProxy(PriceOracle, [service.address, VALID_TIME], { kind: 'transparent' });
        await priceOracle.deployed();
        await priceOracle.updateToken(1, SYMBOL);
        await priceOracle.updateToken(1, "WQT");

        await oracleSetPrice(ETH_PRICE, SYMBOL);

        const wETH = await ethers.getContractFactory('wETH');
        weth = await wETH.deploy();
        await weth.transfer(user1.address, parseEther("1000").toString());
        await weth.transfer(user2.address, parseEther("1000").toString());

        const BridgeToken = await ethers.getContractFactory('WQBridgeToken');
        wusd_token = await upgrades.deployProxy(
            BridgeToken,
            ["WUSD stablecoin", "WUSD", 18],
            { initializer: 'initialize', kind: 'transparent' }
        );
        await wusd_token.deployed();
        await wusd_token.grantRole(await wusd_token.MINTER_ROLE(), owner.address);

        const Router = await ethers.getContractFactory('WQRouter');
        router = await upgrades.deployProxy(
            Router,
            [
                priceOracle.address,
                wusd_token.address,
                STABILITY_FEE,
                ANNUAL_INTEREST_RATE,
                feeReceiver.address
            ],
            { kind: 'transparent' }
        );

        await wusd_token.grantRole(await wusd_token.MINTER_ROLE(), router.address);
        await wusd_token.grantRole(await wusd_token.BURNER_ROLE(), router.address);

        const Auction = await ethers.getContractFactory('WQCollateralAuction');
        auction = await upgrades.deployProxy(
            Auction,
            [
                weth.address,
                priceOracle.address,
                router.address,
                LIQUIDATE_TRESHOLD,
                START_PRICE_FACTOR,
                parseEther("1"),
                COLLATERAL_AUCTION_DURATION,
                PRICE_INDEX_STEP
            ],
            { kind: 'transparent' }
        );
        await router.setToken(1, weth.address, auction.address, MIN_RATIO, SYMBOL);

        Vault = await ethers.getContractFactory('WQRouterVault');
    });

    describe('Deployment', () => {
        it('STEP1: Should set the roles, addresses and variables', async () => {
            expect(await auction.token()).equal(weth.address);
            expect(await auction.oracle()).equal(priceOracle.address);
            expect(await auction.router()).equal(router.address);
            expect(await auction.liquidateThreshold()).equal(LIQUIDATE_TRESHOLD);
            expect(await auction.upperBoundCost()).equal(START_PRICE_FACTOR);
            expect(await auction.lowerBoundCost()).equal(parseEther("1"));
            expect(await auction.priceIndexStep()).equal(PRICE_INDEX_STEP);
            expect(await auction.totalAuctioned()).equal(0);

            expect(
                await auction.hasRole(await auction.DEFAULT_ADMIN_ROLE(), owner.address)
            ).equal(true);
            expect(
                await auction.hasRole(await auction.ADMIN_ROLE(), owner.address)
            ).equal(true);
            expect(
                await auction.hasRole(await auction.UPGRADER_ROLE(), owner.address)
            ).equal(true);
            expect(
                await auction.getRoleAdmin(await auction.UPGRADER_ROLE())
            ).equal(await auction.ADMIN_ROLE());
        });
    });

    describe('Check auction functions directly', () => {
        beforeEach(async () => {
            await auction.setRouter(likeRouter.address);
        });
        it('STEP1: Add lot', async () => {
            await auction.connect(likeRouter).addLot(user1.address, ETH_PRICE, parseEther("1"), parseEther("1.5"));

            expect(await auction.prices(0)).equal(ETH_PRICE);
            expect(await auction.priceIndexes(ETH_PRICE)).equal(0);
            expect(await auction.totalAuctioned()).equal(0);

            let lot = await auction.lots(ETH_PRICE, 0);
            expect(lot.user).equal(user1.address);
            expect(lot.price).equal(ETH_PRICE);
            expect(lot.amount).equal(parseEther("1"));
            expect(lot.buyer).equal(NULL_ADDRESS);
            expect(lot.saleAmount).equal(0);
            expect(lot.endCost).equal(0);
            expect(lot.endTime).equal(0);
            expect(lot.status).equal(LotStatus.New);
        });
        it('STEP2: Move lot', async () => {
            await auction.connect(likeRouter).addLot(user1.address, ETH_PRICE, parseEther("1"), parseEther("1.5"));
            await auction.connect(likeRouter).moveLot(ETH_PRICE, 0, LOWER_ETH_PRICE, parseEther("1"));

            let lot = await auction.lots(LOWER_ETH_PRICE, 0);
            expect(lot.user).equal(user1.address);
            expect(lot.price).equal(LOWER_ETH_PRICE);
            expect(lot.amount).equal(parseEther("1"));
            expect(lot.buyer).equal(NULL_ADDRESS);
            expect(lot.saleAmount).equal(0);
            expect(lot.endCost).equal(0);
            expect(lot.endTime).equal(0);
            expect(lot.status).equal(LotStatus.New);
        });
    });

    describe('Check auction functions thru router', () => {
        it('STEP1: Add lot (produceWUSD)', async () => {
            await weth.connect(user1).approve(router.address, parseEther("1"));
            await oracleSetPrice(ETH_PRICE, SYMBOL);
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);

            let lotIndexes = (await router.getUserLots(user1.address, 0, 1, SYMBOL))[0];
            let lot = await auction.lots(lotIndexes.priceIndex, lotIndexes.index);
            expect(lot.user).equal(user1.address);
            expect(lot.price).equal(ETH_PRICE);
            expect(lot.amount).equal(parseEther("1"));
            expect(lot.buyer).equal(NULL_ADDRESS);
            expect(lot.saleAmount).equal(0);
            expect(lot.endCost).equal(0);
            expect(lot.endTime).equal(0);
            expect(lot.status).equal(LotStatus.New);
        });

        it('STEP2: Move lot (claimExtraDebt)', async () => {
            await weth.connect(user1).approve(router.address, parseEther("1"));
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);
            await oracleSetPrice(UPPER_ETH_PRICE, SYMBOL);
            await router.connect(user1).claimExtraDebt(ETH_PRICE, 0, SYMBOL);

            let collateralInfo = await router.collaterals(SYMBOL, user1.address);
            expect(collateralInfo.collateralAmount).equal(parseEther("1"));
            expect(collateralInfo.debtAmount).equal(parseEther("30"));

            let lotIndexes = (await router.getUserLots(user1.address, 0, 1, SYMBOL))[0];
            let lot = await auction.lots(lotIndexes.priceIndex, lotIndexes.index);
            expect(lot.user).equal(user1.address);
            expect(lot.price).equal(UPPER_ETH_PRICE);
            expect(lot.amount).equal(parseEther("1"));
            expect(lot.buyer).equal(NULL_ADDRESS);
            expect(lot.saleAmount).equal(0);
            expect(lot.endCost).equal(0);
            expect(lot.endTime).equal(0);
            expect(lot.status).equal(LotStatus.New);
        });

        it('STEP3: Move lot (disposeDebt)', async () => {
            await weth.connect(user1).approve(router.address, parseEther("1"));
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);
            await oracleSetPrice(LOWER_ETH_PRICE, SYMBOL);

            await router.connect(user1).disposeDebt(ETH_PRICE, 0, SYMBOL, { value: parseEther("10") });

            let collateralInfo = await router.collaterals(SYMBOL, user1.address);
            expect(collateralInfo.collateralAmount).equal(parseEther("1"));
            expect(collateralInfo.debtAmount).equal(parseEther("10"));

            let lotIndexes = (await router.getUserLots(user1.address, 0, 1, SYMBOL))[0];
            let lot = await auction.lots(lotIndexes.priceIndex, lotIndexes.index);
            expect(lot.user).equal(user1.address);
            expect(lot.price).equal(LOWER_ETH_PRICE);
            expect(lot.amount).equal(parseEther("1"));
            expect(lot.buyer).equal(NULL_ADDRESS);
            expect(lot.saleAmount).equal(0);
            expect(lot.endCost).equal(0);
            expect(lot.endTime).equal(0);
            expect(lot.status).equal(LotStatus.New);
        });

        it('STEP4: Decrease lot amount (removeCollateral)', async () => {
            await weth.connect(user1).approve(router.address, parseEther("1"));
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);
            await wusd_token.connect(user1).approve(router.address, parseEther("2"));
            await router.connect(user1).removeCollateral(ETH_PRICE, 0, parseEther("10"), SYMBOL);

            let collateralInfo = await router.collaterals(SYMBOL, user1.address);
            expect(collateralInfo.collateralAmount).equal(parseEther("0.5"));
            expect(collateralInfo.debtAmount).equal(parseEther("10"));

            let lotIndexes = (await router.getUserLots(user1.address, 0, 1, SYMBOL))[0];
            let lot = await auction.lots(lotIndexes.priceIndex, lotIndexes.index);
            expect(lot.user).equal(user1.address);
            expect(lot.price).equal(ETH_PRICE);
            expect(lot.amount).equal(parseEther("0.5"));
            expect(lot.buyer).equal(NULL_ADDRESS);
            expect(lot.saleAmount).equal(0);
            expect(lot.endCost).equal(0);
            expect(lot.endTime).equal(0);
            expect(lot.status).equal(LotStatus.New);
        });
    });

    describe('Check auction bidding', () => {
        beforeEach(async () => {
            await oracleSetPrice(ETH_PRICE, SYMBOL);
            await weth.connect(user1).approve(router.address, parseEther("1"));
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);
        });

        it("STEP1: Get liquidated collaterall amount when price decreased", async () => {
            await oracleSetPrice(parseEther("20"), SYMBOL);
            expect(
                await auction.getLiquidatedCollaterallAmount()
            ).equal(parseEther("1"));
        });
        it("STEP2: Start collateral auction", async () => {
            await oracleSetPrice(parseEther("20"), SYMBOL);
            await auction.connect(user2).startAuction(ETH_PRICE, 0, parseEther("1"));
            let lot_info = await auction.lots(ETH_PRICE, 0);
            expect(lot_info.status).equal(LotStatus.Auctioned);
            expect(lot_info.saleAmount).equal(parseEther("1"));
            expect(lot_info.endCost).equal(parseEther("20"));
            expect(lot_info.endTime).equal(await getCurrentTimestamp() + parseInt(COLLATERAL_AUCTION_DURATION));
        });
        it("STEP3: Buy collateral", async () => {
            await wusd_token.mint(user2.address, parseEther("23"));
            await wusd_token.connect(user2).approve(router.address, parseEther("23"))
            await oracleSetPrice(parseEther("20"), SYMBOL);
            await auction.connect(user2).startAuction(ETH_PRICE, 0, parseEther("1"));
            let lot_info = await auction.lots(ETH_PRICE, 0);
            await ethers.provider.send("evm_setNextBlockTimestamp", [parseInt(lot_info.endTime)]);

            let balanceWUSDBefore = await wusd_token.balanceOf(user2.address);
            let balanceETHBefore = await weth.balanceOf(user2.address);
            await auction.connect(user2).buyLot(ETH_PRICE, 0);
            let balanceWUSDAfter = await wusd_token.balanceOf(user2.address);
            let balanceETHAfter = await weth.balanceOf(user2.address);

            expect(((balanceWUSDBefore - balanceWUSDAfter) / 1e18).toFixed(2)).equal("22.00");
            expect(((balanceETHAfter - balanceETHBefore) / 1e18).toFixed(2)).equal("1.00");

            lot_info = await auction.lots(ETH_PRICE, 0);
            expect(lot_info.buyer).equal(user2.address);
            expect(lot_info.amount).equal(0);
            expect(lot_info.saleAmount).equal(0);
            expect(lot_info.status).equal(LotStatus.Liquidated);
        });
        it("STEP4: Cancel auction", async () => {
            await await oracleSetPrice(parseEther("20"), SYMBOL);
            await auction.connect(user2).startAuction(ETH_PRICE, 0, parseEther("1"));
            let lot_info = await auction.lots(ETH_PRICE, 0);
            await ethers.provider.send("evm_setNextBlockTimestamp", [parseInt(lot_info.endTime) + 1]);

            await auction.connect(user2).cancelAuction(ETH_PRICE, 0);

            lot_info = await auction.lots(ETH_PRICE, 0);
            expect(lot_info.buyer).equal(NULL_ADDRESS);
            expect(lot_info.amount).equal(parseEther("1"));
            expect(lot_info.saleAmount).equal(0);
            expect(lot_info.status).equal(LotStatus.New);
        });
    });
    describe('Check auction: fails', () => {
        beforeEach(async () => {
            await oracleSetPrice(ETH_PRICE, SYMBOL);
            await weth.connect(user1).approve(router.address, parseEther("2"));
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);
            await router.connect(user1).produceWUSD(parseEther("0.5"), parseEther("1.5"), SYMBOL);
            await oracleSetPrice(parseEther("20"), SYMBOL);
        });
        it("STEP1: Start auction when total auctioned greater liquidated amount", async () => {
            await auction.connect(user2).startAuction(ETH_PRICE, 0, parseEther("1"))
            await expect(
                auction.connect(user2).startAuction(ETH_PRICE, 1, parseEther("0.500000000000000001"))
            ).revertedWith("WQAuction: Amount of tokens purchased is greater than the amount liquidated");
        });
        it("STEP2: Start auction when price:(oldPrice/ratio) less than liquidationThreshold", async () => {
            await oracleSetPrice(parseEther("19"), SYMBOL);
            await expect(
                auction.connect(user2).startAuction(ETH_PRICE, 0, parseEther("1"))
            ).revertedWith("WQAuction: This lot is not available for sale");
        });
        it("STEP3: Start auction when status of lot is not New or Selled", async () => {
            await auction.connect(user2).startAuction(ETH_PRICE, 1, parseEther("0.5"));
            await expect(
                auction.connect(user2).startAuction(ETH_PRICE, 1, parseEther("0.5"))
            ).revertedWith("WQAuction: Status is not New");
        });
        it("STEP4: Start auction when amount of bid is greater then lot amount", async () => {
            await expect(
                auction.connect(user2).startAuction(ETH_PRICE, 0, parseEther("1.000000000000000001"))
            ).revertedWith("WQAuction: Amount of tokens purchased is greater than lot amount");
        });
        it("STEP5: Buy lot when lot is not auctioned", async () => {
            await expect(
                auction.connect(user2).buyLot(ETH_PRICE, 0)
            ).revertedWith("WQAuction: Lot is not auctioned");
        });
        it("STEP6: Buy lot when auction time is over", async () => {
            await auction.connect(user2).startAuction(ETH_PRICE, 0, parseEther("1"));
            let lot_info = await auction.lots(ETH_PRICE, 0);
            await ethers.provider.send("evm_setNextBlockTimestamp", [parseInt(lot_info.endTime) + 1]);
            await expect(
                auction.connect(user2).buyLot(ETH_PRICE, 0)
            ).revertedWith("WQAuction: Auction time is over");
        });
        it("STEP7: Buy lot when WUSD value is insufficient", async () => {
            await wusd_token.mint(user2.address, parseEther("3"));
            await auction.connect(user2).startAuction(ETH_PRICE, 0, parseEther("1"));
            let lot_info = await auction.lots(ETH_PRICE, 0);
            await ethers.provider.send("evm_setNextBlockTimestamp", [parseInt(lot_info.endTime)]);
            await expect(
                auction.connect(user2).buyLot(ETH_PRICE, 0)
            ).revertedWith("WQAuction: Insufficient amount");
        });
        it("STEP8: Cancel lot when lot is not auctioned", async () => {
            await expect(
                auction.connect(user2).cancelAuction(ETH_PRICE, 0)
            ).revertedWith("WQAuction: Lot is not auctioned");
        });
        it("STEP9: Cancel lot when auction time is not over yet", async () => {
            await auction.connect(user2).startAuction(ETH_PRICE, 0, parseEther("1"));
            await expect(
                auction.connect(user2).cancelAuction(ETH_PRICE, 0)
            ).revertedWith("WQAuction: Auction time is not over yet");
        });
    });
    describe('Admin functions', () => {
        it("STEP1: Set price oracle address", async () => {
            await auction.setOracle(ONE_ADDRESS);
            expect(
                await auction.oracle()
            ).equal(ONE_ADDRESS);
        });
        it("STEP2: Set router address", async () => {
            await auction.setRouter(ONE_ADDRESS);
            expect(
                await auction.router()
            ).equal(ONE_ADDRESS);
        });
        it("STEP3: Set collateral token address", async () => {
            await auction.setToken(ONE_ADDRESS);
            expect(
                await auction.token()
            ).equal(ONE_ADDRESS);
        });
        it("STEP4: Set threshold value when collateral liquidated", async () => {
            await auction.setLiquidateTreshold(ONE);
            expect(
                await auction.liquidateThreshold()
            ).equal(ONE);
        });
        it("STEP5: Set factor of start coefficient of cost for dutch auction", async () => {
            await auction.setUpperBoundCost(ONE);
            expect(
                await auction.upperBoundCost()
            ).equal(ONE);
        });
        it("STEP6: Set factor of end coefficient of cost for dutch auction", async () => {
            await auction.setLowerBoundCost(ONE);
            expect(
                await auction.lowerBoundCost()
            ).equal(ONE);
        });
        it("STEP7: Set duration of auction", async () => {
            await auction.setAuctionDuration(ONE);
            expect(
                await auction.auctionDuration()
            ).equal(ONE);
        });
        it("STEP8: Set step of price indexes", async () => {
            await auction.setPriceIndexStep(ONE);
            expect(
                await auction.priceIndexStep()
            ).equal(ONE);
        });
    });
});