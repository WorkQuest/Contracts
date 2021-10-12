const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });
const Web3 = require('web3');
const { parseEther } = require("ethers/lib/utils");
const { wordlists } = require("@ethersproject/wordlists");
const web3 = new Web3(hre.network.provider);

const nonce = 1;
const chainWQ = 1;
const chainETH = 2;
const chainBSC = 3;
const amount = "500000000000000000";
const newToken = "0x1234567890AbcdEF1234567890aBcdef12345678";
const null_addr = "0x0000000000000000000000000000000000000000";
const symbol = "WQT";
const lockable_symbol = "LT";
const native_coin = "WUSD";
const swapStatus = Object.freeze({
    Empty: 0,
    Initialized: 1,
    Redeemed: 2
});

let bridge_owner;
let validator;
let not_validator;
let sender;
let recipient;

describe("Bridge test", () => {
    let bridge;
    let token;
    let lockable_token;
    let bridge_pool;
    beforeEach(async () => {
        [bridge_owner, sender, recipient, validator, not_validator] = await ethers.getSigners();
        const WQToken = await ethers.getContractFactory("WQToken");
        token = await upgrades.deployProxy(WQToken, [amount], { initializer: 'initialize' });
        await token.deployed();
        await token.transfer(sender.address, amount);

        const WQBridgeToken = await ethers.getContractFactory("WQBridgeToken");
        lockable_token = await upgrades.deployProxy(WQBridgeToken, ["LockToken", lockable_symbol], { initializer: 'initialize' });
        await lockable_token.deployed();
        await lockable_token.grantRole(await lockable_token.MINTER_ROLE(), bridge_owner.address);
        await lockable_token.mint(sender.address, amount);

        const BridgePool = await ethers.getContractFactory("WQBridgePool");
        bridge_pool = await upgrades.deployProxy(BridgePool, [], { initializer: 'initialize' });
        await bridge_pool.deployed();

        const Bridge = await ethers.getContractFactory("WQBridge");
        bridge = await upgrades.deployProxy(Bridge, [chainWQ, bridge_pool.address], { initializer: 'initialize' });
        await bridge.deployed();
        await bridge.grantRole(await bridge.VALIDATOR_ROLE(), validator.address);
        await bridge.updateChain(chainETH, true);
        await bridge.updateToken(token.address, true, false, false, symbol);
        await bridge.updateToken(lockable_token.address, true, false, true, lockable_symbol);

        await bridge_pool.grantRole(await bridge_pool.BRIDGE_ROLE(), bridge.address);

        let minter_role = await token.MINTER_ROLE();
        let burner_role = await token.BURNER_ROLE();
        await token.grantRole(minter_role, bridge.address);
        await token.grantRole(burner_role, bridge.address);

    });

    describe('Bridge: deploy', () => {
        it('STEP 1: Deployer address must have ADMIN_ROLE role', async () => {
            expect(
                await bridge.hasRole(await bridge.ADMIN_ROLE(), bridge_owner.address)
            ).to.equal(true);
        });
        it('STEP 2: Validator address must have VALIDATOR_ROLE role', async () => {
            expect(
                await bridge.hasRole(await bridge.VALIDATOR_ROLE(), validator.address)
            ).to.equal(true);
        });
        it('STEP 3: Not validator address sholdn\'t have VALIDATOR_ROLE role', async () => {
            expect(
                await bridge.hasRole(await bridge.VALIDATOR_ROLE(), not_validator.address)
            ).to.equal(false);
        });
    });

    describe('bridge: swap', () => {

        it('STEP 1: Swap with same chain id: fail', async () => {
            try {
                await bridge.connect(sender).swap(nonce, chainWQ, amount, recipient.address, symbol, { value: 0 });
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: Invalid chainTo id");
            }
        });

        it('STEP 2: Swap to disallowed chain: fail', async () => {
            try {
                await bridge.connect(sender).swap(nonce, chainBSC, amount, recipient.address, symbol, { value: 0 });
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: ChainTo ID is not allowed");
            }
        });

        it('STEP 3: Swap disallowed token: fail', async () => {
            try {
                await bridge.connect(sender).swap(nonce, chainBSC, amount, recipient.address, native_coin, { value: 0 });
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: ChainTo ID is not allowed");
            }
        });

        it('STEP 4: Swap with not empty state: fail', async () => {
            await bridge.connect(sender).swap(nonce, chainETH, amount, recipient.address, symbol, { value: 0 });

            try {
                await bridge.connect(sender).swap(nonce, chainETH, amount, recipient.address, symbol, { value: 0 });
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: Swap is not empty state or duplicate transaction");
            }
        });

        it('STEP 5: Swap WQT token: success', async () => {
            expect(
                await token.balanceOf(sender.address)
            ).to.be.equal(amount);
            let recipient_addr = recipient.address;
            await bridge.connect(sender).swap(nonce, chainETH, amount, recipient.address, symbol, { value: 0 });
            message = await web3.utils.soliditySha3(
                { t: 'uint', v: nonce },
                { t: 'uint', v: amount },
                { t: 'address', v: recipient_addr },
                { t: 'uint256', v: chainWQ },
                { t: 'uint256', v: chainETH },
                { t: 'string', v: symbol }
            );
            let data = await bridge.swaps(message);
            expect(data.nonce).to.equal(nonce);
            expect(data.state).to.equal(swapStatus.Initialized);
            expect(
                await token.balanceOf(sender.address)
            ).to.be.equal(0);
        });

        it('STEP6: Swap native coin with wrong amount: fail', async () => {
            await bridge.updateToken(null_addr, true, true, false, native_coin);
            try {
                await bridge.connect(sender).swap(nonce, chainETH, amount, recipient.address, native_coin, { value: 1 });
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: Amount value is not equal to transfered funds");
            }
        });

        it('STEP7: Swap native coin: success', async () => {
            await bridge.updateToken(null_addr, true, true, false, native_coin);
            let recipient_addr = recipient.address;
            await bridge.connect(sender).swap(nonce, chainETH, amount, recipient.address, native_coin, { value: amount });
            message = await web3.utils.soliditySha3(
                { t: 'uint', v: nonce },
                { t: 'uint', v: amount },
                { t: 'address', v: recipient_addr },
                { t: 'uint256', v: chainWQ },
                { t: 'uint256', v: chainETH },
                { t: 'string', v: native_coin }
            );
            let data = await bridge.swaps(message);
            expect(data.nonce).to.equal(nonce);
            expect(data.state).to.equal(swapStatus.Initialized);
            expect(
                await web3.eth.getBalance(bridge_pool.address)
            ).to.be.equal(amount);
        });
        it('STEP8: Swap lockable token: success', async () => {
            expect(
                await lockable_token.balanceOf(sender.address)
            ).to.be.equal(amount);
            let recipient_addr = recipient.address;
            await lockable_token.connect(sender).approve(bridge.address, amount);
            await bridge.connect(sender).swap(nonce, chainETH, amount, recipient_addr, lockable_symbol);
            message = await web3.utils.soliditySha3(
                { t: 'uint', v: nonce },
                { t: 'uint', v: amount },
                { t: 'address', v: recipient_addr },
                { t: 'uint256', v: chainWQ },
                { t: 'uint256', v: chainETH },
                { t: 'string', v: lockable_symbol }
            );
            let data = await bridge.swaps(message);
            expect(data.nonce).to.equal(nonce);
            expect(data.state).to.equal(swapStatus.Initialized);
            expect(
                await lockable_token.balanceOf(bridge_pool.address)
            ).to.be.equal(amount);
            expect(
                await lockable_token.balanceOf(sender.address)
            ).to.be.equal(0);
        });
    });

    describe('Bridge: redeem', () => {
        let recipient_addr;
        let message;
        beforeEach(async () => {
            recipient_addr = recipient.address;
            message = web3.utils.soliditySha3(
                { t: 'uint256', v: nonce },
                { t: 'uint256', v: amount },
                { t: 'address', v: recipient_addr },
                { t: 'uint256', v: chainETH },
                { t: 'uint256', v: chainWQ },
                { t: 'string', v: symbol }
            );
        });

        it('STEP 1: Redeem with same chain id: fail', async () => {
            let signature = await web3.eth.sign(message, validator.address);
            let sig = ethers.utils.splitSignature(signature)
            try {
                await bridge.redeem(
                    nonce,
                    chainWQ,
                    amount,
                    recipient_addr,
                    sig.v,
                    sig.r,
                    sig.s,
                    symbol
                );
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: Invalid chainFrom ID");
            }
        });

        it('STEP 2: Redeem from disallowed chain: fail', async () => {
            let signature = await web3.eth.sign(message, validator.address);
            let sig = ethers.utils.splitSignature(signature)
            try {
                await bridge.redeem(
                    nonce,
                    chainBSC,
                    amount,
                    recipient_addr,
                    sig.v,
                    sig.r,
                    sig.s,
                    symbol
                );
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: chainFrom ID is not allowed");
            }
        });

        it('STEP 3: Should revert if swap already redeemed', async () => {
            let signature = await web3.eth.sign(message, validator.address);
            let sig = ethers.utils.splitSignature(signature)
            await bridge.redeem(
                nonce,
                chainETH,
                amount,
                recipient_addr,
                sig.v,
                sig.r,
                sig.s,
                symbol
            );
            try {
                await bridge.redeem(
                    nonce,
                    chainETH,
                    amount,
                    recipient_addr,
                    sig.v,
                    sig.r,
                    sig.s,
                    symbol
                );
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: Swap is not empty state or duplicate transaction");
            }
        });

        it('STEP 4: Should revert if the provided message was not signed by the validator', async () => {
            let signature = await web3.eth.sign(message, not_validator.address);
            let sig = ethers.utils.splitSignature(signature);
            try {
                await bridge.redeem(
                    nonce,
                    chainETH,
                    amount,
                    recipient_addr,
                    sig.v,
                    sig.r,
                    sig.s,
                    symbol
                );
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: Validator address is invalid or signature is faked");
            }
        });
        it('STEP 5: Redeem: success', async () => {
            expect(
                await token.balanceOf(recipient.address)
            ).to.be.equal(0);
            let signature = await web3.eth.sign(message, validator.address);
            let sig = ethers.utils.splitSignature(signature)

            await bridge.redeem(
                nonce,
                chainETH,
                amount,
                recipient_addr,
                sig.v,
                sig.r,
                sig.s,
                symbol
            );
            let data = await bridge.swaps(message);
            expect(data.nonce).to.equal(nonce);
            expect(data.state).to.equal(swapStatus.Redeemed);
            expect(
                await token.balanceOf(recipient.address)
            ).to.be.equal(amount);
        });

        it('STEP6: Redeem native coin: success', async () => {
            await bridge.updateToken(null_addr, true, true, false, native_coin);
            let senderBeforeAmount = await web3.eth.getBalance(sender.address);
            await bridge.connect(sender).swap(nonce, chainETH, amount, recipient_addr, native_coin, { value: amount });
            let senderAfterAmount = await web3.eth.getBalance(sender.address);
            expect(
                ((senderBeforeAmount - senderAfterAmount) / 1e18).toFixed(2)
            ).to.be.equal((amount / 1e18).toFixed(2));

            expect(
                await web3.eth.getBalance(bridge_pool.address)
            ).to.be.equal(amount);

            message = web3.utils.soliditySha3(
                { t: 'uint256', v: nonce },
                { t: 'uint256', v: amount },
                { t: 'address', v: recipient_addr },
                { t: 'uint256', v: chainETH },
                { t: 'uint256', v: chainWQ },
                { t: 'string', v: native_coin }
            );
            let signature = await web3.eth.sign(message, validator.address);
            let sig = ethers.utils.splitSignature(signature)

            let recipientBeforeAmount = await web3.eth.getBalance(recipient_addr);
            await bridge.redeem(
                nonce,
                chainETH,
                amount,
                recipient_addr,
                sig.v,
                sig.r,
                sig.s,
                native_coin
            );
            let recipientAfterAmount = await web3.eth.getBalance(recipient_addr);
            expect(
                ((recipientAfterAmount - recipientBeforeAmount) / 1e18).toFixed(2)
            ).to.be.equal((amount / 1e18).toFixed(2));

            let data = await bridge.swaps(message);
            expect(data.nonce).to.equal(nonce);
            expect(data.state).to.equal(swapStatus.Redeemed);
            expect(
                await web3.eth.getBalance(bridge_pool.address)
            ).to.be.equal('0');
        });

        it('STEP7: Redeem lockable token: success', async () => {
            expect(
                await lockable_token.balanceOf(recipient_addr)
            ).to.be.equal(0);
            await lockable_token.connect(sender).approve(bridge.address, amount);
            await bridge.connect(sender).swap(nonce, chainETH, amount, recipient_addr, lockable_symbol);
            expect(
                await lockable_token.balanceOf(bridge_pool.address)
            ).to.be.equal(amount);

            message = web3.utils.soliditySha3(
                { t: 'uint256', v: nonce },
                { t: 'uint256', v: amount },
                { t: 'address', v: recipient_addr },
                { t: 'uint256', v: chainETH },
                { t: 'uint256', v: chainWQ },
                { t: 'string', v: lockable_symbol }
            );
            let signature = await web3.eth.sign(message, validator.address);
            let sig = ethers.utils.splitSignature(signature)

            await bridge.redeem(
                nonce,
                chainETH,
                amount,
                recipient_addr,
                sig.v,
                sig.r,
                sig.s,
                lockable_symbol
            );

            let data = await bridge.swaps(message);
            expect(data.nonce).to.equal(nonce);
            expect(data.state).to.equal(swapStatus.Redeemed);
            expect(
                await lockable_token.balanceOf(bridge_pool.address)
            ).to.be.equal('0');
            expect(
                await lockable_token.balanceOf(recipient_addr)
            ).to.be.equal(amount);
        });
    });
    describe('Bridge: admin functions', () => {
        it('STEP1: updateChain: Should revert if caller is no admin', async () => {
            try {
                await bridge.connect(sender).updateChain(chainBSC, true);
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("AccessControl: account");
            }
        });
        it('STEP2: Add chain id', async () => {
            expect(
                await bridge.chains(chainBSC)
            ).to.be.equal(false);
            await bridge.updateChain(chainBSC, true);
            expect(
                await bridge.chains(chainBSC)
            ).to.be.equal(true);
        });
        it('STEP3: Remove chain id', async () => {
            expect(
                await bridge.chains(chainETH)
            ).to.be.equal(true);
            await bridge.updateChain(chainETH, false);
            expect(
                await bridge.chains(chainETH)
            ).to.be.equal(false);
        });
        it('STEP4: updateToken: Should revert if caller is no admin', async () => {
            try {
                await bridge.connect(sender).updateToken(newToken, false, true, false, symbol);
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("AccessControl: account");
            }
        });
        it('STEP5: Update token settings', async () => {
            let token_info = await bridge.tokens(symbol);
            expect(
                token_info.token
            ).to.be.equal(token.address);
            expect(
                token_info.enabled
            ).to.be.equal(true);
            expect(
                token_info.native
            ).to.be.equal(false);
            await bridge.updateToken(newToken, false, true, false, symbol);
            token_info = await bridge.tokens(symbol);
            expect(
                token_info.token
            ).to.be.equal(newToken);
            expect(
                token_info.enabled
            ).to.be.equal(false);
            expect(
                token_info.native
            ).to.be.equal(true);
        });
    });
});