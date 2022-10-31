const Web3 = require('web3')
const { expect } = require('chai')
const { ethers, web3 } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')
const { time } = require("@nomicfoundation/hardhat-network-helpers");
  

const STABILITY_FEE = parseEther('0.1') //10%
const ANNUAL_INTEREST_RATE = parseEther('0.02') //2%
const VALID_TIME = 1000
const SYMBOL = 'ETH'
const SYMBOL_wETH = 'wETH'
const ETH_PRICE = parseEther('30') // 1 wETH token = 30 WUSD
const WQT_PRICE = parseEther('0.3')
const UPPER_ETH_PRICE = parseEther('45')
const LOWER_ETH_PRICE = parseEther('15')
const LIQUIDATE_TRESHOLD = parseEther('1.4') // 140%
const START_PRICE_FACTOR = parseEther('1.2')
const COLLATERAL_AUCTION_DURATION = '300' // 5 min
const PRICE_INDEX_STEP = parseEther('1') // 1 WUSD
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
const ONE_ADDRESS = '0x0000000000000000000000000000000000000001'
const ONE = '1'
const MIN_RATIO = parseEther('1.2')

const LotStatus = Object.freeze({
    Unknown: 0,
    New: 1,
    Auctioned: 2,
    Liquidated: 3,
})

describe('Collateral auction test', function () {
    let Vault
    let priceOracle
    let weth
    let router
    let auction
    let nonce = 1
    let owner
    let alice
    let bob
    let service
    let likeRouter
    let feeReceiver

    async function oracleSetPrice(price, symbol) {
        nonce += 1
        let message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: [price.toString()] },
            { t: 'uint256', v: ['2000000000000000000'] },
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
            ['2000000000000000000'],
            [symbol]
        )
        await hre.ethers.provider.send('evm_mine', [])
    }

    // ==================================================================

    async function getCurrentTimestamp() {
        let block = await web3.eth.getBlock(await web3.eth.getBlockNumber())
        return block.timestamp
    }

    beforeEach(async function () {
        ;[owner, alice, bob, service, likeRouter, feeReceiver] =
            await ethers.getSigners()

        const PriceOracle = await ethers.getContractFactory('WQPriceOracle')
        priceOracle = await upgrades.deployProxy(
            PriceOracle,
            [service.address, VALID_TIME],
            { kind: 'transparent' }
        )

        await priceOracle.deployed()
        await priceOracle.updateToken(1, SYMBOL_wETH)
        await priceOracle.updateToken(1, 'WQT')

        await oracleSetPrice(ETH_PRICE, SYMBOL_wETH)

        // ========================================================================

        const wETH = await ethers.getContractFactory('WQBridgeToken')
        weth = await upgrades.deployProxy(wETH, ['wETH', 'wETH', 18], {
            initializer: 'initialize',
            kind: 'transparent',
        })

        await weth.grantRole(await weth.MINTER_ROLE(), owner.address)
        await weth.mint(owner.address, parseEther('2000'))
        await weth.transfer(alice.address, parseEther('1000').toString())
        await weth.transfer(bob.address, parseEther('1000').toString())

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

        const Router = await ethers.getContractFactory('WQRouter')
        router = await upgrades.deployProxy(
            Router,
            [priceOracle.address, wusd_token.address, feeReceiver.address],
            { kind: 'transparent' }
        )

        await wusd_token.grantRole(
            await wusd_token.MINTER_ROLE(),
            router.address
        )
        await wusd_token.grantRole(
            await wusd_token.BURNER_ROLE(),
            router.address
        )

        const Auction = await ethers.getContractFactory('WQCollateralAuction')
        auction = await upgrades.deployProxy(
            Auction,
            [
                weth.address,
                priceOracle.address,
                router.address,
                LIQUIDATE_TRESHOLD,
                COLLATERAL_AUCTION_DURATION,
                parseEther('0.03'),
                parseEther('0.05'),
                parseEther('0.05'),
            ],
            { kind: 'transparent' }
        )

        await router.setToken(
            1,
            weth.address,
            auction.address,
            MIN_RATIO,
            SYMBOL_wETH
        )

        Vault = await ethers.getContractFactory('WQRouterVault')
    })

    it('should add lot (produceWUSD)', async function () {
        expect(await auction.token()).equal(weth.address)
        expect(await auction.oracle()).equal(priceOracle.address)
        expect(await auction.router()).equal(router.address)
        expect(await auction.liquidateThreshold()).equal(LIQUIDATE_TRESHOLD)
        expect(await auction.totalAuctioned()).equal(0)

        const collateralAmount = parseEther('1')
        const collateralRatio = parseEther('1.5')

        await weth.connect(alice).approve(router.address, parseEther('3'))
        await oracleSetPrice(ETH_PRICE, SYMBOL_wETH) // 30
        await router
            .connect(alice)
            .produceWUSD(collateralAmount, collateralRatio, SYMBOL_wETH) // WUSD = collateralAmount * price(ETH_PRICE30) / collateralRatio = 20 (20000000000000000000)

        const lotIndex = (
            await router.getUserLots(alice.address, 0, 1, SYMBOL_wETH)
        )[0]
        const lot = await auction.lots(lotIndex)
        expect(lot.price).equal(ETH_PRICE)
        expect(lot.amount).equal(collateralAmount)
        expect(lot.saleAmount).equal(0)
        expect(lot.endPrice).equal(0)
        expect(lot.endTime).equal(0)
        expect(lot.status).equal(LotStatus.New)
    })

    it('should be able to (claimExtraDebt)', async function () {
        const collateralAmount = parseEther('1')
        const collateralRatio = parseEther('1.5')

        await weth.connect(alice).approve(router.address, collateralAmount)
        await oracleSetPrice(ETH_PRICE, SYMBOL_wETH)
        await router
            .connect(alice)
            .produceWUSD(collateralAmount, collateralRatio, SYMBOL_wETH)

        await oracleSetPrice(UPPER_ETH_PRICE, SYMBOL_wETH)
        await router.connect(alice).claimExtraDebt(0, SYMBOL_wETH)

        const lotIndex = (
            await router.getUserLots(alice.address, 0, 1, SYMBOL_wETH)
        )[0]
        const lot = await auction.lots(lotIndex)
        expect(lot.price).equal(UPPER_ETH_PRICE)
        expect(lot.amount).equal(collateralAmount)
        expect(lot.saleAmount).equal(0)
        expect(lot.endPrice).equal(0)
        expect(lot.endTime).equal(0)
        expect(lot.status).equal(LotStatus.New)
    })

    it('should be able to (disposeDebt)', async function () {
        await weth.connect(alice).approve(router.address, parseEther('1'))
        await router
            .connect(alice)
            .produceWUSD(parseEther('1'), parseEther('1.5'), SYMBOL_wETH)

        await oracleSetPrice(LOWER_ETH_PRICE, SYMBOL_wETH)

        await wusd_token
            .connect(alice)
            .approve(router.address, parseEther('10')) // WUSD stablecoin
        await router.connect(alice).disposeDebt(0, SYMBOL_wETH)

        const lotIndexes = (
            await router.getUserLots(alice.address, 0, 1, SYMBOL_wETH)
        )[0]

        const lot = await auction.lots(lotIndexes)
        await priceOracle.getTokenPriceUSD(SYMBOL_wETH)

        expect(lot.user).equal(alice.address)
        expect(lot.price).equal(LOWER_ETH_PRICE)
        expect(lot.amount).equal(parseEther('1'))
        expect(lot.saleAmount).equal(0)
        expect(lot.endPrice).equal(0)
        expect(lot.endTime).equal(0)
        expect(lot.status).equal(LotStatus.New)
    })

    it('should be able to (removeCollateral)', async function () {
        const collateralAmount = parseEther('1')
        const collateralRatio = parseEther('1.5')

        await oracleSetPrice(ETH_PRICE, SYMBOL_wETH)

        await weth.connect(alice).approve(router.address, collateralAmount)
        const aliceBalanceBefore = await weth.balanceOf(alice.address)
        
        await router
            .connect(alice)
            .produceWUSD(collateralAmount, collateralRatio, SYMBOL_wETH)

        const aliceBalanceAfter = await weth.balanceOf(alice.address)
        expect(aliceBalanceAfter.toString()).to.eq(
            (aliceBalanceBefore - collateralAmount).toString()
        )

        const balanUserWUSD = await wusd_token.balanceOf(alice.address)  
        expect(balanUserWUSD.toString()).to.eq((collateralAmount * ETH_PRICE / collateralRatio).toString()) // WUSD = collateralAmount * price / collateralRatio

        await wusd_token
            .connect(alice)
            .approve(router.address, parseEther('20'))

        const auctionBalanceBefore = await weth.balanceOf(auction.address)
        expect(auctionBalanceBefore.toString()).to.eq('0')

        await router.connect(alice).removeCollateral(0, SYMBOL_wETH)
        

        const userWUSDAfter = await wusd_token.balanceOf(alice.address)
        expect(userWUSDAfter.toString()).to.eq('0')

        const userWETHBalanceAfter = await weth.balanceOf(alice.address)
        expect(userWETHBalanceAfter.toString()).to.eq("999900000000000000000")

        const auctionBalanceAfter = await weth.balanceOf(auction.address)
        expect(auctionBalanceAfter.toString()).to.eq(
            ((parseEther('0.05') * parseEther('1')) / 1e18).toString()
        )

        const feeReceiverBalance = await weth.balanceOf(feeReceiver.address) 
        expect(feeReceiverBalance.toString()).to.eq(
            ((parseEther('0.05') * parseEther('1')) / 1e18).toString()
        )
    })

    // =================================================================================
    // =================================================================================

    describe('Check auction bidding', function(){
        it('should be able to send collaterall to the auction', async function () {
            const collateralAmount = parseEther('1')
            const collateralRatio = parseEther('1.2')

            await oracleSetPrice(parseEther("0.99"), SYMBOL_wETH)

            const aliceWethBalanceBefore = await weth
                .connect(alice)
                .balanceOf(alice.address)
            const aliceWusdBalanceBefore = await wusd_token
                .connect(alice)
                .balanceOf(alice.address)
            expect(aliceWusdBalanceBefore.toString()).to.eq('0')

            await weth.connect(alice).approve(router.address, collateralAmount)
            await router
                .connect(alice)
                .produceWUSD(collateralAmount, collateralRatio, SYMBOL_wETH) // WUSD = collateralAmount * price / collateralRatio

            const aliceWethBalanceAfter = await weth
                .connect(alice)
                .balanceOf(alice.address)
            expect(aliceWethBalanceAfter.toString()).to.eq(
                (aliceWethBalanceBefore - collateralAmount).toString()
            )

            const oraclePrice = parseEther("0.979999999999999999")
            await oracleSetPrice(oraclePrice, SYMBOL_wETH)
            await wusd_token
                .connect(alice)
                .approve(router.address, parseEther('20')) // WUSD stablecoin
            await router.connect(alice).disposeDebt(0, SYMBOL_wETH)

            const lotIndex = (
                await router.getUserLots(alice.address, 0, 1, SYMBOL_wETH)
            )[0]
            const lot = await auction.lots(lotIndex)
        
            expect(lot.price).to.eq(oraclePrice)
            expect(lot.amount).to.eq(collateralAmount)
            expect(lot.saleAmount).equal(0)
            expect(lot.endPrice).equal(0)
            expect(lot.endTime).equal(0)
            expect(lot.status).equal(LotStatus.New)

            await auction
                .connect(bob)
                .startAuction(0, parseEther('0'))

        })

        it('should able to start auction', async function () {
            const collateralAmount = parseEther('1')
            const collateralRatio = parseEther('1.2')

            await oracleSetPrice(parseEther("0.99"), SYMBOL_wETH)

            const aliceWusdBalanceBefore = await wusd_token
                .connect(alice)
                .balanceOf(alice.address)
            expect(aliceWusdBalanceBefore.toString()).to.eq('0')

            await weth.connect(alice).approve(router.address, collateralAmount)
            await router
                .connect(alice)
                .produceWUSD(collateralAmount, collateralRatio, SYMBOL_wETH) // WUSD = collateralAmount * price / collateralRatio


            const oraclePrice = parseEther("0.969999999999999999")
            await oracleSetPrice(oraclePrice, SYMBOL_wETH)
            await wusd_token
                .connect(alice)
                .approve(router.address, parseEther('20')) 
            await router.connect(alice).disposeDebt(0, SYMBOL_wETH)

            await auction
                .connect(bob)
                .startAuction(0, parseEther('0'))

            const lotIndex = (
                await router.getUserLots(alice.address, 0, 1, SYMBOL_wETH)
            )[0]
            const lot = await auction.lots(lotIndex)
            expect(lot.price).to.eq(oraclePrice)
            expect(lot.amount).to.eq(collateralAmount)
            expect(lot.ratio).to.eq(collateralRatio)
            expect(lot.saleAmount).equal(0)
            expect(lot.endPrice).equal(oraclePrice)
            expect(lot.endTime).equal(await getCurrentTimestamp() + parseInt(COLLATERAL_AUCTION_DURATION))
            expect(lot.status).equal(LotStatus.Auctioned)
        })

        it('should able to byu collateral', async function () {
            const collateralAmount = parseEther('2')
            const collateralRatio = parseEther('1.2')

            await wusd_token.mint(bob.address, parseEther("23"));
            await wusd_token.connect(bob).approve(router.address, parseEther("23"))

            await oracleSetPrice(parseEther("0.999999999999999999"), SYMBOL_wETH)            

            await weth.connect(alice).approve(router.address, collateralAmount);
            await router.connect(alice).produceWUSD(collateralAmount, collateralRatio, SYMBOL_wETH);

            const oraclePrice = parseEther("0.969999999999999999")
            await oracleSetPrice(oraclePrice, SYMBOL_wETH)
            const liquidatedAmount = await auction.getLiquidatedCollaterallAmount(0)
            const lotIndex = (
                await router.getUserLots(alice.address, 0, 1, SYMBOL_wETH)
            )[0]

            await auction.connect(bob).startAuction(lotIndex, liquidatedAmount)
            const lot_info = await auction.lots(lotIndex) 
            await ethers.provider.send("evm_setNextBlockTimestamp", [parseInt(lot_info.endTime)]);

            const balanceWUSDBefore = await wusd_token.balanceOf(bob.address); 
            const balanceETHBefore = await weth.balanceOf(bob.address);
            
            await time.increase(60);
            await auction.connect(bob).buyLot(lotIndex);
            

            const balanceWUSDAfter = await wusd_token.balanceOf(bob.address);    
            const balanceETHAfter = await weth.balanceOf(bob.address); 
            
            expect(((balanceWUSDBefore - balanceWUSDAfter) / 1e18).toFixed(2)).to.eq("0.05")
            expect(((balanceETHAfter - balanceETHBefore) / 1e18).toFixed(2)).to.eq("0.05")            
        })

        it('should able to cancel auction', async function () {
            const collateralAmount = parseEther('2')
            const collateralRatio = parseEther('1.2')

            await wusd_token.mint(bob.address, parseEther("23"));
            await wusd_token.connect(bob).approve(router.address, parseEther("23"))

            await oracleSetPrice(parseEther("0.999999999999999999"), SYMBOL_wETH)            

            await weth.connect(alice).approve(router.address, collateralAmount);
            await router.connect(alice).produceWUSD(collateralAmount, collateralRatio, SYMBOL_wETH);

            const oraclePrice = parseEther("0.969999999999999999")
            await oracleSetPrice(oraclePrice, SYMBOL_wETH)
            const liquidatedAmount = await auction.getLiquidatedCollaterallAmount(0)
            const lotIndex = (
                await router.getUserLots(alice.address, 0, 1, SYMBOL_wETH)
            )[0]

            await auction.connect(bob).startAuction(lotIndex, liquidatedAmount)
            const lot_info = await auction.lots(lotIndex)

            await ethers.provider.send("evm_setNextBlockTimestamp", [parseInt(lot_info.endTime) + 1]);

            await auction.connect(bob).cancelAuction(lotIndex)
            const lotInfoAfter = await auction.lots(lotIndex)
            expect(lotInfoAfter.saleAmount).to.eq("0")
            expect(lotInfoAfter.endPrice).to.eq("0")
            expect(lotInfoAfter.endTime).to.eq("0")
            expect(lotInfoAfter.status).to.eq(LotStatus.New)
            
        })
    })

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
    
        it("STEP5: Set duration of auction", async () => {
            await auction.setAuctionDuration(ONE);
            expect(
                await auction.auctionDuration()
            ).equal(ONE);
        });
    });

    describe('Check auction: fails', () => {
    
        beforeEach(async () => {
            const collateralAmount = parseEther('2')
            const collateralRatio = parseEther('1.2')

            await wusd_token.mint(bob.address, parseEther("23"));
            await wusd_token.connect(bob).approve(router.address, parseEther("23"))

            await oracleSetPrice(parseEther("0.999999999999999999"), SYMBOL_wETH)            

            await weth.connect(alice).approve(router.address, collateralAmount);
            await router.connect(alice).produceWUSD(collateralAmount, collateralRatio, SYMBOL_wETH);

            const oraclePrice = parseEther("0.969999999999999999")
            await oracleSetPrice(oraclePrice, SYMBOL_wETH)
        });

        it("STEP1: Start auction when total auctioned greater liquidated amount", async function() {
            await wusd_token
                .connect(alice)
                .approve(router.address, parseEther('20')) 
            await router.connect(alice).disposeDebt(0, SYMBOL_wETH)

            await expect(
                auction.connect(bob).startAuction(0, parseEther("10"))
            ).revertedWith("WQAuction: Amount of tokens purchased is greater than lot amount");
        });

        it("STEP2: Start auction when price:(oldPrice/ratio) less than liquidationThreshold", async () => {
            await oracleSetPrice(parseEther("19"), SYMBOL_wETH);
            await expect(
                auction.connect(bob).startAuction(0, parseEther("0.1"))
            ).revertedWith("WQAuction: This lot is not available for sale");
        });
    });
})
