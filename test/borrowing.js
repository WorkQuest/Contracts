const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });
const Web3 = require('web3');
const { parseEther } = require("ethers/lib/utils");
const web3 = new Web3(hre.network.provider);
const FIXED_RATE = parseEther("0.013");
const PENSION_LOCK_TIME = 94608000;
const PENSION_DEFAULT_FEE = parseEther("0.05");
const PRICE_ORACLE_VALID_TIME = 600;
const YEAR = 31536000;
const PENSION_FEE_PER_MONTH = "1200000000000000";
const PENSION_FEE_WITHDRAW = "5000000000000000";
const BORROWING_FEE = "5000000000000000";
const AUCTION_DURATION = 1800;
const UPPER_BOUND_COST = "1200000000000000000";
const LOWER_BOUND_COST = "950000000000000000";

describe("Borrowing test", () => {
    let nonce = 1;
    let depositor;
    let borrower;
    let validator;
    let buyer;
    let feeReceiver;
    let eth_token;
    let wusd_token;
    let priceOracle;
    let pension;
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
        [owner, depositor, borrower, validator, buyer, feeReceiver] = await ethers.getSigners();

        const BridgeToken = await ethers.getContractFactory("WQBridgeToken");

        eth_token = await upgrades.deployProxy(
            BridgeToken,
            ["ETH WQ wrapped", "ETH", 18],
            { initializer: 'initialize', kind: 'transparent' }
        );
        await eth_token.deployed();
        await eth_token.grantRole(await eth_token.MINTER_ROLE(), owner.address);
        await eth_token.mint(borrower.address, parseEther("10"));

        wusd_token = await upgrades.deployProxy(
            BridgeToken,
            ["WUSD stablecoin", "WUSD", 18],
            { initializer: 'initialize', kind: 'transparent' }
        );
        await wusd_token.deployed();
        await wusd_token.grantRole(await wusd_token.MINTER_ROLE(), owner.address);

        const PriceOracle = await hre.ethers.getContractFactory('WQPriceOracle');
        priceOracle = await upgrades.deployProxy(PriceOracle, [validator.address, PRICE_ORACLE_VALID_TIME], { initializer: 'initialize', kind: 'transparent' });
        await priceOracle.deployed();
        await priceOracle.updateToken(1, "ETH");

        const PensionFund = await ethers.getContractFactory("WQPensionFund");
        pension = await upgrades.deployProxy(PensionFund,
            [
                PENSION_LOCK_TIME,
                PENSION_DEFAULT_FEE,
                wusd_token.address,
                feeReceiver.address,
                PENSION_FEE_PER_MONTH,
                PENSION_FEE_WITHDRAW
            ],
            { initializer: 'initialize', kind: 'transparent' })
        await pension.setApy(7, parseEther("0.0644"));

        const Borrowing = await hre.ethers.getContractFactory("WQBorrowing");
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
        );
        await borrowing.setApy(7, parseEther("0.1594"));
        await borrowing.setToken(eth_token.address, "ETH");
        await borrowing.addFund(pension.address);
        await pension.connect(owner).grantRole(await pension.BORROWER_ROLE(), borrowing.address);

        await eth_token.connect(borrower).approve(borrowing.address, parseEther("1"));
        await oracleSetPrice(parseEther("300"), "ETH");
        await wusd_token.mint(depositor.address, parseEther("330"));
        await wusd_token.connect(depositor).approve(pension.address, parseEther("330"));
        await pension.connect(depositor).contribute(depositor.address, parseEther("300"));
        await wusd_token.mint(buyer.address, parseEther("200"));
    });

    describe('Borrowing: deploy', () => {
        it('Should be set all variables and roles', async () => {
            expect(await borrowing.oracle()).equal(priceOracle.address);
            expect(await borrowing.fixedRate()).equal(FIXED_RATE);
            expect(await borrowing.hasRole(await borrowing.DEFAULT_ADMIN_ROLE(), owner.address)).equal(true);
            expect(await borrowing.hasRole(await borrowing.ADMIN_ROLE(), owner.address)).equal(true);
            expect(await borrowing.hasRole(await borrowing.UPGRADER_ROLE(), owner.address)).equal(true);
        });
    });

    describe('Borrowing: success execution', () => {
        it('STEP 1: Borrow', async () => {
            let balanceBefore = await wusd_token.balanceOf(borrower.address);
            let balanceEthBefore = await eth_token.balanceOf(borrower.address);
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            let balanceAfter = await wusd_token.balanceOf(borrower.address);
            let balanceEthAfter = await eth_token.balanceOf(borrower.address);
            expect(((balanceEthBefore - balanceEthAfter) / 1e18).toFixed(2)).equal('1.00');
            expect(((balanceAfter - balanceBefore) / 1e18).toFixed(2)).equal('200.00');
        });

        it('STEP 2: Refund', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await wusd_token.mint(borrower.address, parseEther("36"));
            await wusd_token.connect(borrower).approve(borrowing.address, parseEther("236"));
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + YEAR]);
            let balanceBefore = await wusd_token.balanceOf(borrower.address);
            let balanceEthBefore = await eth_token.balanceOf(borrower.address);
            await borrowing.connect(borrower).refund(0, parseEther("200"));
            let balanceAfter = await wusd_token.balanceOf(borrower.address);
            let balanceEthAfter = await eth_token.balanceOf(borrower.address);
            expect(((balanceEthAfter - balanceEthBefore) / 1e18).toFixed(2)).equal('1.00');
            expect(((balanceBefore - balanceAfter) / 1e18).toFixed(2)).equal('235.48');
        });


    });

    describe('Borrow: auction collateral', () => {
        it('STEP 1: Start auction', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + 7 * 24 * 60 * 60]);
            await oracleSetPrice(parseEther("300"), "ETH");
            await borrowing.connect(buyer).startAuction(borrower.address, 0, parseEther("0.5"));
            let lot_info = await borrowing.borrowers(borrower.address, 0);
            expect(lot_info.saleAmount).equal(parseEther("0.5"));
            expect(lot_info.endCost).equal(parseEther("150"));
            expect(lot_info.endTime).equal(await getTimestamp() + AUCTION_DURATION);

        });

        it('STEP 2: Buy collateral', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + 7 * 24 * 60 * 60]);
            await oracleSetPrice(parseEther("300"), "ETH");
            await borrowing.connect(buyer).startAuction(borrower.address, 0, parseEther("0.5"));
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + 1440]);
            await hre.ethers.provider.send("evm_mine", []);
            expect(
                await borrowing.getCurrentLotCost(borrower.address, 0)
            ).equal(parseEther("150"));
            await wusd_token.connect(buyer).approve(borrowing.address, parseEther("200"));
            await borrowing.connect(buyer).buyCollateral(borrower.address, 0);
        });

        it('STEP 3: Cancel auction', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + 7 * 24 * 60 * 60]);
            await oracleSetPrice(parseEther("300"), "ETH");
            await borrowing.connect(buyer).startAuction(borrower.address, 0, parseEther("0.5"));
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + 1801]);
            await borrowing.connect(buyer).cancelAuction(borrower.address, 0);
            let lot_info = await borrowing.borrowers(borrower.address, 0);
            expect(lot_info.saleAmount).equal(0);
            expect(lot_info.endCost).equal(0);
            expect(lot_info.endTime).equal(0);
        });
    });

    describe('Borrow: failed execution', () => {
        it('STEP 1: Borrow for disabled token', async () => {
            await expect(
                borrowing.connect(borrower).borrow(1, depositor.address, parseEther("1"), 0, 7, "LOL")
            ).revertedWith("WQBorrowing: This token is disabled to collateral");
        });

        it('STEP 2: Borrow with invalid duration', async () => {
            await expect(
                borrowing.connect(borrower).borrow(1, depositor.address, parseEther("1"), 0, 6, "ETH")
            ).revertedWith("WQBorrowing: Invalid duration");
        });

        it('STEP 3: borrow when insufficient amount in fund', async () => {
            await expect(
                borrowing.connect(borrower).borrow(1, depositor.address, parseEther("400"), 0, 7, "ETH")
            ).revertedWith("WQBorrowing: Insufficient amount in fund");
        });
    });

    describe('Refund: failed execution', () => {
        it('STEP 1: Refund when not borrowed moneys', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await wusd_token.mint(borrower.address, parseEther("36"));
            await wusd_token.connect(borrower).approve(borrowing.address, parseEther("236"));
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + YEAR]);
            await borrowing.connect(borrower).refund(0, parseEther("200"));
            await expect(
                borrowing.connect(borrower).refund(0, parseEther("200"))
            ).revertedWith("WQBorrowing: You are not borrowed moneys");
        });

        it('STEP 2: Refund when token disabled', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("1"), 0, 7, "ETH");
            await borrowing.setToken("0x0000000000000000000000000000000000000000", "ETH");
            await expect(
                borrowing.connect(borrower).refund(0, parseEther("200"))
            ).revertedWith("WQBorrowing: Token is disabled");
        });

        it('STEP 3: Refund insufficient amount', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + YEAR]);
            await expect(
                borrowing.connect(borrower).refund(0, parseEther("200"))
            ).revertedWith("ERC20: insufficient allowance");
        });
    });

    describe('Auction collateral: failed execution', () => {
        it('STEP 1: Start auction when time of credit not over yet', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + 6 * 24 * 60 * 60]);
            await oracleSetPrice(parseEther("300"), "ETH");
            await expect(
                borrowing.connect(buyer).startAuction(borrower.address, 0, parseEther("0.5"))
            ).revertedWith("WQBorrowing: Collateral is not available for purchase");
        });

        it('STEP 2: Start auction when auction started yet', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + 7 * 24 * 60 * 60 + 1]);
            await oracleSetPrice(parseEther("300"), "ETH");
            await borrowing.connect(buyer).startAuction(borrower.address, 0, parseEther("0.5"))
            await expect(
                borrowing.connect(buyer).startAuction(borrower.address, 0, parseEther("0.5"))
            ).revertedWith("WQBorrowing: Collateral is already auctioned");
        });

        it('STEP 3: Start auction when price of collateral is insufficient to repay the credit', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + 7 * 24 * 60 * 60 + 1]);
            await oracleSetPrice(parseEther("200"), "ETH");
            await expect(
                borrowing.connect(buyer).startAuction(borrower.address, 0, parseEther("0.5"))
            ).revertedWith("WQBorrowing: Collateral price is insufficient to repay the credit");
        });

        it('STEP 4: Start auction of a too many of tokens', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + 7 * 24 * 60 * 60 + 1]);
            await oracleSetPrice(parseEther("300"), "ETH");
            await expect(
                borrowing.connect(buyer).startAuction(borrower.address, 0, parseEther("0.67"))
            ).revertedWith("WQBorrowing: Too many amount of tokens");
        });

        it('STEP 5: Buy collateral when time is over', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + 7 * 24 * 60 * 60 + 1]);
            await oracleSetPrice(parseEther("300"), "ETH");
            await borrowing.connect(buyer).startAuction(borrower.address, 0, parseEther("0.5"));
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + AUCTION_DURATION + 1]);
            await expect(
                borrowing.connect(buyer).buyCollateral(borrower.address, 0)
            ).revertedWith("WQBorrowing: Auction time is over");
        });

        it('STEP 6: Cancel auction when time is not over yet', async () => {
            await borrowing.connect(borrower).borrow(1, depositor.address, parseEther("200"), 0, 7, "ETH");
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [await getTimestamp() + 7 * 24 * 60 * 60 + 1]);
            await oracleSetPrice(parseEther("300"), "ETH");
            await borrowing.connect(buyer).startAuction(borrower.address, 0, parseEther("0.5"));
            await expect(
                borrowing.connect(buyer).cancelAuction(borrower.address, 0)
            ).revertedWith("WQBorrowing: Auction time is not over yet");
        });
    });
});