const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });
const Web3 = require('web3');
const { parseEther } = require("ethers/lib/utils");
const web3 = new Web3(hre.network.provider);
const FIXED_RATE = parseEther("0.013");
const LENDING_APY = parseEther("0.0431");
const PENSION_LOCK_TIME = 94608000;
const PENSION_DEFAULT_FEE = parseEther("0.05");
const PRICE_ORACLE_VALID_TIME = 600;
const WQT_SUPPLY = parseEther("100000000");
const YEAR = 31536000;


describe("Borrowing test", () => {
    let nonce = 1;
    let depositor;
    let borrower;
    let validator;

    let wqt_token;
    let eth_token;
    let bnb_token;
    let priceOracle;
    let pension;
    let lending;
    let saving;
    let borrowing;

    async function oracleSetPrice(price, symbol) {
        nonce += 1;
        let message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: price.toString() },
            { t: 'string', v: symbol }
        );
        let signature = await web3.eth.sign(message, validator.address);
        let sig = ethers.utils.splitSignature(signature);
        await priceOracle.setTokenPriceUSD(nonce, price, sig.v, sig.r, sig.s, symbol);
        await ethers.provider.send("evm_mine", []);
    }

    async function getTimestamp() {
        let blockNumber = await ethers.provider.send("eth_blockNumber", []);
        let txBlockNumber = await ethers.provider.send("eth_getBlockByNumber", [blockNumber, false]);
        return parseInt(new BigNumber(txBlockNumber.timestamp).toString())
    }

    beforeEach(async () => {
        [deployer, depositor, borrower, validator, buyer] = await ethers.getSigners();
        const WQToken = await ethers.getContractFactory("WQToken");
        wqt_token = await upgrades.deployProxy(WQToken, [WQT_SUPPLY], { initializer: 'initialize', kind: 'transparent' });
        await wqt_token.deployed();

        const WQBridgeToken = await ethers.getContractFactory("WQBridgeToken");
        eth_token = await upgrades.deployProxy(WQBridgeToken, ["ETH WQ wrapped", "ETH"], { initializer: 'initialize', kind: 'transparent' });
        await eth_token.deployed();
        await eth_token.grantRole(await eth_token.MINTER_ROLE(), deployer.address);
        await eth_token.mint(borrower.address, parseEther("10"));

        bnb_token = await upgrades.deployProxy(WQBridgeToken, ["BNB WQ wrapped", "BNB"], { initializer: 'initialize', kind: 'transparent' });
        await bnb_token.deployed();

        const PriceOracle = await hre.ethers.getContractFactory('WQPriceOracle');
        priceOracle = await upgrades.deployProxy(PriceOracle, [validator.address, PRICE_ORACLE_VALID_TIME], { initializer: 'initialize', kind: 'transparent' });
        await priceOracle.deployed();
        await priceOracle.updateToken(1, "ETH");
        await priceOracle.updateToken(1, "BNB");
        await priceOracle.updateToken(1, "WQT");

        const PensionFund = await hre.ethers.getContractFactory("WQPensionFund");
        pension = await upgrades.deployProxy(PensionFund, [PENSION_LOCK_TIME, PENSION_DEFAULT_FEE], { initializer: 'initialize', kind: 'transparent' })

        const Lending = await hre.ethers.getContractFactory("WQLending");
        lending = await upgrades.deployProxy(Lending, [LENDING_APY], { initializer: 'initialize', kind: 'transparent' });

        const Saving = await hre.ethers.getContractFactory("WQSavingProduct");
        saving = await upgrades.deployProxy(Saving, [], { initializer: 'initialize', kind: 'transparent' });

        const Borrowing = await hre.ethers.getContractFactory("WQBorrowing");
        borrowing = await upgrades.deployProxy(Borrowing, [priceOracle.address, FIXED_RATE], { initializer: 'initialize', kind: 'transparent' })
        await borrowing.setApy(7, parseEther("0.0451"));
        await borrowing.setApy(14, parseEther("0.0467"));
        await borrowing.setApy(30, parseEther("0.0482"));
        await borrowing.setApy(90, parseEther("0.0511"));
        await borrowing.setApy(180, parseEther("0.0523"));
        await borrowing.setToken(eth_token.address, "ETH");
        await borrowing.setToken(bnb_token.address, "BNB");
        await borrowing.setToken(wqt_token.address, "WQT");
        await borrowing.addFund(pension.address);
        await borrowing.addFund(lending.address);
        await borrowing.addFund(saving.address);
        await pension.grantRole(await pension.BORROWER_ROLE(), borrowing.address);
        await lending.grantRole(await lending.BORROWER_ROLE(), borrowing.address);
        await saving.grantRole(await saving.BORROWER_ROLE(), borrowing.address);

        await eth_token.connect(borrower).approve(borrowing.address, parseEther("1"));
        await oracleSetPrice(parseEther("300"), "ETH");
        await pension.connect(depositor).contribute(depositor.address, { value: parseEther("300") });

    });

    describe('Borrowing: deploy', () => {
        it('Should be set all variables and roles', async () => {
            expect(await borrowing.oracle()).equal(priceOracle.address);
            expect(await borrowing.fixedRate()).equal(FIXED_RATE);
            expect(await borrowing.hasRole(await borrowing.DEFAULT_ADMIN_ROLE(), deployer.address)).equal(true);
            expect(await borrowing.hasRole(await borrowing.ADMIN_ROLE(), deployer.address)).equal(true);
            expect(await borrowing.hasRole(await borrowing.UPGRADER_ROLE(), deployer.address)).equal(true);
        });
    });

    describe('Borrowing: success execution', () => {
        it('STEP 1: Borrow', async () => {
            let balanceBefore = await web3.eth.getBalance(borrower.address);
            let balanceEthBefore = await eth_token.balanceOf(borrower.address);
            await borrowing.connect(borrower).borrow(1, parseEther("1"), 0, 7, "ETH");
            let balanceAfter = await web3.eth.getBalance(borrower.address);
            let balanceEthAfter = await eth_token.balanceOf(borrower.address);
            expect(((balanceEthBefore - balanceEthAfter) / 1e18).toFixed(2)).equal('1.00');
            expect(((balanceAfter - balanceBefore) / 1e18).toFixed(2)).equal('200.00');
        });

        it('STEP 2: Refund', async () => {
            await borrowing.connect(borrower).borrow(1, parseEther("1"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + YEAR]);
            let balanceBefore = await web3.eth.getBalance(borrower.address);
            let balanceEthBefore = await eth_token.balanceOf(borrower.address);
            await borrowing.connect(borrower).refund(1, parseEther("200"), { value: parseEther("211.62") });
            let balanceAfter = await web3.eth.getBalance(borrower.address);
            let balanceEthAfter = await eth_token.balanceOf(borrower.address);
            expect(((balanceEthAfter - balanceEthBefore) / 1e18).toFixed(2)).equal('1.00');
            expect(((balanceBefore - balanceAfter) / 1e18).toFixed(2)).equal('211.62');
        });

        it('STEP 3: Buy collateral', async () => {
            await borrowing.connect(borrower).borrow(1, parseEther("1"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + YEAR]);
            let balanceBefore = await web3.eth.getBalance(buyer.address);
            let balanceEthBefore = await eth_token.balanceOf(buyer.address);
            await oracleSetPrice(parseEther("200"), "ETH");
            await borrowing.connect(buyer).buyCollateral(1, borrower.address, parseEther("200"), { value: parseEther("211.63") });
            let balanceAfter = await web3.eth.getBalance(buyer.address);
            let balanceEthAfter = await eth_token.balanceOf(buyer.address);
            expect(((balanceEthAfter - balanceEthBefore) / 1e18).toFixed(2)).equal('1.00');
            expect(((balanceBefore - balanceAfter) / 1e18).toFixed(2)).equal('211.62');
        });
    });

    describe('Borrow: failed execution', () => {
        it('STEP 1: Borrow for disabled token', async () => {
            await expect(
                borrowing.connect(borrower).borrow(1, parseEther("1"), 0, 7, "LOL")
            ).revertedWith("WQBorrowing: This token is disabled to collateral");
        });

        it('STEP 2: Borrow with invalid duration', async () => {
            await expect(
                borrowing.connect(borrower).borrow(1, parseEther("1"), 0, 6, "ETH")
            ).revertedWith("WQBorrowing: Invalid duration");
        });

        it('STEP 3: borrow when previously credit not refunded', async () => {
            await borrowing.connect(borrower).borrow(1, parseEther("0.5"), 0, 7, "ETH");
            await expect(
                borrowing.connect(borrower).borrow(1, parseEther("0.5"), 0, 7, "ETH")
            ).revertedWith("WQBorrowing: You are not refunded credit");
        });

        it('STEP 4: borrow when insufficient amount in fund', async () => {
            await expect(
                borrowing.connect(borrower).borrow(1, parseEther("2"), 0, 7, "ETH")
            ).revertedWith("WQBorrowing: Insufficient amount in fund");
        });
    });

    describe('Refund: failed execution', () => {
        it('STEP 1: Refund when not borrowed moneys', async () => {
            await expect(
                borrowing.connect(borrower).refund(1, parseEther("300"), { value: parseEther("300") })
            ).revertedWith("WQBorrowing: You are not borrowed moneys");
        });

        it('STEP 2: Refund when token disabled', async () => {
            await borrowing.connect(borrower).borrow(1, parseEther("1"), 0, 7, "ETH");
            await borrowing.setToken("0x0000000000000000000000000000000000000000", "ETH");
            await expect(
                borrowing.connect(borrower).refund(1, parseEther("200"), { value: parseEther("211.62") })
            ).revertedWith("WQBorrowing: Token is disabled");
        });

        it('STEP 3: Refund insufficient amount', async () => {
            await borrowing.connect(borrower).borrow(1, parseEther("1"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + YEAR]);
            await expect(
                borrowing.connect(borrower).refund(1, parseEther("200"), { value: parseEther("200") })
            ).revertedWith("WQBorrowing: Refund insufficient amount");
        });
    });
});
