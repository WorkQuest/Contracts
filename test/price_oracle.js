const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'))
const { expect } = require('chai')
const { ethers } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')

const VALID_TIME = 300;
const PRICE = parseEther("3000");
const SYMBOL = "ETH";

describe('Price Oracle Test', () => {
    let price_oracle;
    let owner;
    let service;
    let not_service;
    let user;
    let nonce = 0;

    beforeEach(async () => {
        require('dotenv').config();
        [owner, service, user, not_service] = await ethers.getSigners();

        const PriceOracle = await hre.ethers.getContractFactory('WQPriceOracle');
        price_oracle = await upgrades.deployProxy(PriceOracle, [service.address, VALID_TIME]);
        await price_oracle.deployed();
        await price_oracle.updateToken(1, SYMBOL);
    });

    describe('Deployment', () => {
        it('STEP1: Should set the roles for creator and service and set valid time', async () => {
            expect(
                await price_oracle.hasRole(await price_oracle.DEFAULT_ADMIN_ROLE(), owner.address)
            ).to.equal(true);
            expect(
                await price_oracle.hasRole(await price_oracle.ADMIN_ROLE(), owner.address)
            ).to.equal(true);
            expect(
                await price_oracle.hasRole(await price_oracle.UPGRADER_ROLE(), owner.address)
            ).to.equal(true);
            expect(
                await price_oracle.hasRole(await price_oracle.SERVICE_ROLE(), service.address)
            ).to.equal(true);
            expect(
                await price_oracle.getRoleAdmin(await price_oracle.UPGRADER_ROLE())
            ).to.equal(await price_oracle.ADMIN_ROLE());
            expect(
                await price_oracle.getRoleAdmin(await price_oracle.SERVICE_ROLE())
            ).to.equal(await price_oracle.ADMIN_ROLE());
            expect(
                await price_oracle.validTime()
            ).to.equal(VALID_TIME);
        });
    });
    describe('Set price', () => {
        it('STEP 1: Set disabled token: fail', async () => {
            let message = web3.utils.soliditySha3(
                { t: 'uint256', v: nonce },
                { t: 'uint256', v: PRICE.toString() },
                { t: 'string', v: "SYMBOL" }
            );
            let signature = await web3.eth.sign(message, service.address);
            let sig = ethers.utils.splitSignature(signature);
            await expect(
                price_oracle.connect(user).setTokenPriceUSD(nonce, PRICE, sig.v, sig.r, sig.s, "SYMBOL")
            ).to.be.revertedWith("WQPriceOracle: Token is disabled");
        });

        it('STEP 2: Set with same nonce: fail', async () => {
            nonce += 1;
            let message = web3.utils.soliditySha3(
                { t: 'uint256', v: nonce },
                { t: 'uint256', v: PRICE.toString() },
                { t: 'string', v: SYMBOL }
            );
            let signature = await web3.eth.sign(message, service.address);
            let sig = ethers.utils.splitSignature(signature);
            await price_oracle.connect(user).setTokenPriceUSD(nonce, PRICE, sig.v, sig.r, sig.s, SYMBOL);
            await expect(
                price_oracle.connect(user).setTokenPriceUSD(nonce, PRICE, sig.v, sig.r, sig.s, SYMBOL)
            ).to.be.revertedWith("WQPriceOracle: Invalid nonce value, must be greater that lastNonce");
        });

        it('STEP 3: Set with same nonce: fail', async () => {
            nonce += 1;
            let message = web3.utils.soliditySha3(
                { t: 'uint256', v: nonce },
                { t: 'uint256', v: PRICE.toString() },
                { t: 'string', v: SYMBOL }
            );
            let signature = await web3.eth.sign(message, service.address);
            let sig = ethers.utils.splitSignature(signature);
            await price_oracle.connect(user).setTokenPriceUSD(nonce, PRICE, sig.v, sig.r, sig.s, SYMBOL);
            await expect(
                price_oracle.connect(user).setTokenPriceUSD(nonce, PRICE, sig.v, sig.r, sig.s, SYMBOL)
            ).to.be.revertedWith("WQPriceOracle: Invalid nonce value, must be greater that lastNonce");
        });

        it('STEP 4: Sign from not service account: fail', async () => {
            nonce += 1;
            let message = web3.utils.soliditySha3(
                { t: 'uint256', v: nonce },
                { t: 'uint256', v: PRICE.toString() },
                { t: 'string', v: SYMBOL }
            );
            let signature = await web3.eth.sign(message, not_service.address);
            let sig = ethers.utils.splitSignature(signature);
            await expect(
                price_oracle.connect(user).setTokenPriceUSD(nonce, PRICE, sig.v, sig.r, sig.s, SYMBOL)
            ).to.be.revertedWith("WQPriceOracle: validator is not a service");
        });

        it('STEP 5: Set valid price: success', async () => {
            nonce += 1;
            let message = web3.utils.soliditySha3(
                { t: 'uint256', v: nonce },
                { t: 'uint256', v: PRICE.toString() },
                { t: 'string', v: SYMBOL }
            );
            let signature = await web3.eth.sign(message, service.address);
            let sig = ethers.utils.splitSignature(signature);
            await price_oracle.connect(user).setTokenPriceUSD(nonce, PRICE, sig.v, sig.r, sig.s, SYMBOL);
            let blockNumber = await hre.ethers.provider.send("eth_blockNumber", []);
            let block = await web3.eth.getBlock(parseInt(blockNumber));
            await expect(
                await price_oracle.lastNonce()
            ).to.equal(nonce);
            await expect(
                (await price_oracle.tokens(SYMBOL)).updatedTime
            ).to.equal(block.timestamp);
            await expect(
                (await price_oracle.tokens(SYMBOL)).price
            ).to.equal(PRICE);
        });
    });


    describe('Get price', () => {
        beforeEach(async () => {
            nonce += 1;
            let message = web3.utils.soliditySha3(
                { t: 'uint256', v: nonce },
                { t: 'uint256', v: PRICE.toString() },
                { t: 'string', v: SYMBOL }
            );
            let signature = await web3.eth.sign(message, service.address);
            let sig = ethers.utils.splitSignature(signature);
            await price_oracle.connect(user).setTokenPriceUSD(nonce, PRICE, sig.v, sig.r, sig.s, SYMBOL);
        });

        it("STEP 1: get price from disabled token: fail", async () => {
            await expect(
                price_oracle.connect(user).getTokenPriceUSD("SYMBOL")
            ).to.be.revertedWith("WQPriceOracle: Token is disabled");
        });

        // it("STEP 2: get price in same transaction: fail", async () => {
        //     const TestPrice = await hre.ethers.getContractFactory('TestPrice');
        //     let test_price = await TestPrice.deploy();

        //     nonce += 1;
        //     let message = web3.utils.soliditySha3(
        //         { t: 'uint256', v: nonce },
        //         { t: 'uint256', v: PRICE.toString() },
        //         { t: 'string', v: SYMBOL }
        //     );
        //     let signature = await web3.eth.sign(message, service.address);
        //     let sig = ethers.utils.splitSignature(signature);

        //     await expect(
        //         test_price.connect(user).setAndGetPrice(
        //             price_oracle.address,
        //             nonce,
        //             PRICE,
        //             sig.v,
        //             sig.r,
        //             sig.s,
        //             SYMBOL
        //         )
        //     ).to.be.revertedWith("WQPriceOracle: Same block");
        // });

        it("STEP 3: get outdated price: fail", async () => {
            await ethers.provider.send("evm_setNextBlockTimestamp", [parseInt((await price_oracle.tokens(SYMBOL)).updatedTime) + VALID_TIME + 1]);
            await ethers.provider.send("evm_mine", []);
            await expect(
                price_oracle.connect(user).getTokenPriceUSD(SYMBOL)
            ).to.be.revertedWith("WQPriceOracle: Price is outdated");
        });

        it("STEP 4: get price: success", async () => {
            await hre.ethers.provider.send("evm_mine", []);
            expect(
                await price_oracle.connect(user).getTokenPriceUSD(SYMBOL)
            ).to.equal(PRICE);
        });
    });
    describe('Admin functions', () => {
        it("STEP 1: Set valid time", async () => {
            await price_oracle.setValidTime(11);
            expect(
                await price_oracle.validTime()
            ).to.equal(11);
        });

        it("STEP 2: Update token", async () => {
            await price_oracle.updateToken(false, SYMBOL);
            expect(
                (await price_oracle.tokens(SYMBOL)).enabled
            ).to.equal(false);

        });
    });
});