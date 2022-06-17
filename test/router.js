const Web3 = require('web3')
const { expect } = require('chai')
const { ethers } = require('hardhat')
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')

const FIXED_RATE = parseEther("0.1"); // 10%
const ANNUAL_INTEREST_RATE = parseEther("0.0"); //2% per year
const VALID_TIME = 600;
const SYMBOL = "ETH";
const ETH_PRICE = parseEther("30"); // 1 wETH token = 30 WUSD
const LIQUIDATE_TRESHOLD = parseEther("1.4"); // 140%
const START_PRICE_FACTOR = parseEther("1.2");
const COLLATERAL_AUCTION_DURATION = "300"; // 5 min
const PRICE_INDEX_STEP = parseEther("1"); // 1 WUSD
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const MIN_RATIO = parseEther("1.5");

describe('Router test', () => {
    let Vault;
    let priceOracle;
    let weth;
    let wusd_token;
    let router;
    let auction;
    let nonce = 1;
    let owner;
    let user1;
    let user2;
    let service;
    let feeReceiver;

    async function getTimestamp() {
        let blockNumber = await hre.ethers.provider.send("eth_blockNumber", []);
        let txBlockNumber = await hre.ethers.provider.send("eth_getBlockByNumber", [blockNumber, false]);
        return parseInt(txBlockNumber.timestamp);
    }

    async function oracleSetPrice(price, symbol) {
        await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + VALID_TIME]);
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
        priceOracle = await upgrades.deployProxy(PriceOracle, [service.address, VALID_TIME], { kind: 'transparent' });
        await priceOracle.deployed();

        await priceOracle.updateToken(1, SYMBOL);
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


        const Router = await ethers.getContractFactory('WQRouter');
        router = await upgrades.deployProxy(Router,
            [
                priceOracle.address,
                wusd_token.address,
                FIXED_RATE,
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
            expect((await router.tokens(SYMBOL)).enabled).to.equal(true);
            expect((await router.tokens(SYMBOL)).collateralAuction).to.equal(auction.address);
            expect(
                await router.hasRole(await router.DEFAULT_ADMIN_ROLE(), owner.address)
            ).to.equal(true);
            expect(
                await router.hasRole(await router.ADMIN_ROLE(), owner.address)
            ).to.equal(true);
            expect(
                await router.hasRole(await router.UPGRADER_ROLE(), owner.address)
            ).to.equal(true);
            expect(
                await router.getRoleAdmin(await router.UPGRADER_ROLE())
            ).to.equal(await router.ADMIN_ROLE());
            let router_info = await router.getParams();
            expect(router_info[0]).to.equal(priceOracle.address);
            expect(router_info[1]).to.equal(wusd_token.address);
            expect(router_info[2]).to.equal(NULL_ADDRESS);
            expect(router_info[3]).to.equal(NULL_ADDRESS);
            expect(router_info[4]).to.equal(FIXED_RATE);
            expect(router_info[5]).to.equal(ANNUAL_INTEREST_RATE);
            expect(router_info[6]).to.equal(feeReceiver.address);
        });
    });

    describe('Produce WUSD', () => {
        it('STEP1: Should create collateral vault and set all variables and transfer WUSD to user', async () => {
            await weth.connect(user1).approve(router.address, parseEther("1"));
            let balanceWUSDBefore = BigInt(await wusd_token.balanceOf(user1.address));
            let balanceETHBefore = BigInt(await weth.balanceOf(user1.address));
            // console.log("balanceWUSDBefore, balanceETHBefore", balanceWUSDBefore, balanceETHBefore);
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);
            let balanceWUSDAfter = BigInt(await wusd_token.balanceOf(user1.address));
            let balanceETHAfter = BigInt(await weth.balanceOf(user1.address));

            expect(balanceETHBefore - balanceETHAfter).to.equal(BigInt(parseEther("1")));
            expect(balanceWUSDAfter - balanceWUSDBefore).to.equal(BigInt(parseEther("20")));

            // check common info
            expect(await router.getCollateral(SYMBOL)).to.equal(parseEther("1"));
            expect(await router.getDebt(SYMBOL)).to.equal(parseEther("20"));

            // check user info
            let collateralInfo = await router.collaterals(SYMBOL, user1.address);
            expect(collateralInfo.collateralAmount).to.equal(parseEther("1"));
            expect(collateralInfo.debtAmount).to.equal(parseEther("20"));
            expect(collateralInfo.vault).to.not.equal(0);

            //check user lots
            let userLots = await router.getUserLots(user1.address, 0, 1, SYMBOL);
            expect(userLots[0].priceIndex).to.equal(parseEther("30"));
            expect(userLots[0].index).to.equal(0);

            // check Auction
            let lotInfo = await auction.lots(userLots[0].priceIndex, userLots[0].index);
            expect(lotInfo.user).to.equal(user1.address);
            expect(lotInfo.price).to.equal(parseEther("30"));
            expect(lotInfo.amount).to.equal(parseEther("1"));
            expect(lotInfo.status).to.equal(1);

            // check Vault
            let vault = await Vault.attach(collateralInfo.vault);
            expect(await vault.router()).to.equal(router.address);
            expect(await vault.owner()).to.equal(user1.address);
            expect(await weth.balanceOf(vault.address)).to.equal(parseEther("1"));
        });
    });

    describe('Claim extra debt when price increased', () => {
        beforeEach(async () => {
            await weth.connect(user1).approve(router.address, parseEther("1"));
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);
            await oracleSetPrice(parseEther("45"), SYMBOL);
        });

        it('STEP1: Should give to user extra debt', async () => {
            let balanceWUSDBefore = BigInt(await wusd_token.balanceOf(user1.address));
            await router.connect(user1).claimExtraDebt(ETH_PRICE, 0, SYMBOL);
            let balanceWUSDAfter = BigInt(await wusd_token.balanceOf(user1.address));
            expect(balanceWUSDAfter - balanceWUSDBefore).to.equal(BigInt(parseEther("10")));

            // check common info
            expect(await router.getCollateral(SYMBOL)).to.equal(parseEther("1"));
            expect(await router.getDebt(SYMBOL)).to.equal(parseEther("30"));

            // check user info
            let collateralInfo = await router.collaterals(SYMBOL, user1.address);
            expect(collateralInfo.collateralAmount).to.equal(parseEther("1"));
            expect(collateralInfo.debtAmount).to.equal(parseEther("30"));

            //check user lots
            let userLots = await router.getUserLots(user1.address, 0, 1, SYMBOL);
            expect(userLots[0].priceIndex).to.equal(parseEther("45"));
            expect(userLots[0].index).to.equal(0);

            // check Auction
            let lotInfo = await auction.lots(userLots[0].priceIndex, userLots[0].index);
            expect(lotInfo.user).to.equal(user1.address);
            expect(lotInfo.price).to.equal(parseEther("45"));
            expect(lotInfo.amount).to.equal(parseEther("1"));
            expect(lotInfo.status).to.equal(1);

            // check Vault
            let vault = await Vault.attach(collateralInfo.vault);
            expect(await vault.router()).to.equal(router.address);
            expect(await vault.owner()).to.equal(user1.address);
            expect(await weth.balanceOf(vault.address)).to.equal(parseEther("1"));
        });
    });

    describe('Dispose debt when price decreased', () => {
        beforeEach(async () => {
            await weth.connect(user1).approve(router.address, parseEther("1"));
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);
            await oracleSetPrice(parseEther("15"), SYMBOL);
        });

        it('STEP1: Should take from user debt', async () => {
            await wusd_token.connect(user1).approve(router.address, parseEther("10"));
            let balanceWUSDBefore = BigInt(await wusd_token.balanceOf(user1.address));
            await router.connect(user1).disposeDebt(ETH_PRICE, 0, SYMBOL);
            let balanceWUSDAfter = BigInt(await wusd_token.balanceOf(user1.address));
            expect(balanceWUSDBefore - balanceWUSDAfter).to.equal(BigInt(parseEther("10")));

            // check common info
            expect(await router.getCollateral(SYMBOL)).to.equal(parseEther("1"));
            expect(await router.getDebt(SYMBOL)).to.equal(parseEther("10"));

            // check user info
            let collateralInfo = await router.collaterals(SYMBOL, user1.address);
            expect(collateralInfo.collateralAmount).to.equal(parseEther("1"));
            expect(collateralInfo.debtAmount).to.equal(parseEther("10"));

            //check user lots
            userLots = await router.getUserLots(user1.address, 0, 1, SYMBOL);
            expect(userLots[0].priceIndex).to.equal(parseEther("15"));
            expect(userLots[0].index).to.equal(0);

            // check Auction
            let lotInfo = await auction.lots(userLots[0].priceIndex, userLots[0].index);
            expect(lotInfo.user).to.equal(user1.address);
            expect(lotInfo.price).to.equal(parseEther("15"));
            expect(lotInfo.amount).to.equal(parseEther("1"));
            expect(lotInfo.status).to.equal(1);

            // check Vault
            let vault = await Vault.attach(collateralInfo.vault);
            expect(await vault.router()).to.equal(router.address);
            expect(await vault.owner()).to.equal(user1.address);
            expect(await weth.balanceOf(vault.address)).to.equal(parseEther("1"));
        });
        it('STEP3: Should reverted when lot is auctioned', async () => {
            await oracleSetPrice(parseEther("21"), SYMBOL);
            await auction.startAuction(ETH_PRICE, 0, parseEther("0.1"));
            await hre.ethers.provider.send("evm_mine", []);
            await expect(
                router.connect(user1).disposeDebt(ETH_PRICE, 0, SYMBOL)
            ).to.be.revertedWith("WQRouter: Status not new");
        });
    });

    describe('Remove collateral', () => {
        beforeEach(async () => {
            await weth.connect(user1).approve(router.address, parseEther("1"));
            await router.connect(user1).produceWUSD(parseEther("1"), parseEther("1.5"), SYMBOL);
        });

        it('STEP1: Should removed part of collateral', async () => {
            await wusd_token.connect(user1).approve(router.address, parseEther("11"));
            let balanceWUSDBefore = BigInt(await wusd_token.balanceOf(user1.address));
            let balanceETHBefore = BigInt(await weth.balanceOf(user1.address));
            await router.connect(user1).removeCollateral(ETH_PRICE, 0, parseEther("10"), SYMBOL);
            let balanceWUSDAfter = BigInt(await wusd_token.balanceOf(user1.address));
            let balanceETHAfter = BigInt(await weth.balanceOf(user1.address));

            expect(balanceETHAfter - balanceETHBefore).to.equal(BigInt(parseEther("0.5")));
            expect(balanceWUSDBefore - balanceWUSDAfter).to.equal(BigInt(parseEther("11.00")));

            // check common info
            expect(await router.getCollateral(SYMBOL)).to.equal(parseEther("0.5"));
            expect(await router.getDebt(SYMBOL)).to.equal(parseEther("10"));

            // check user info
            let collateralInfo = await router.collaterals(SYMBOL, user1.address);
            expect(collateralInfo.collateralAmount).to.equal(parseEther("0.5"));
            expect(collateralInfo.debtAmount).to.equal(parseEther("10"));
            expect(collateralInfo.vault).to.not.equal(0);

            //check user lots
            let userLots = await router.getUserLots(user1.address, 0, 1, SYMBOL);
            expect(userLots[0].priceIndex).to.equal(parseEther("30"));
            expect(userLots[0].index).to.equal(0);

            // check Auction
            let lotInfo = await auction.lots(userLots[0].priceIndex, userLots[0].index);
            expect(lotInfo.user).to.equal(user1.address);
            expect(lotInfo.price).to.equal(parseEther("30"));
            expect(lotInfo.amount).to.equal(parseEther("0.5"));
            expect(lotInfo.status).to.equal(1);

            // check Vault
            let vault = await Vault.attach(collateralInfo.vault);
            expect(await vault.router()).to.equal(router.address);
            expect(await vault.owner()).to.equal(user1.address);
            expect(await weth.balanceOf(vault.address)).to.equal(parseEther("0.5"));
        });
    });
});