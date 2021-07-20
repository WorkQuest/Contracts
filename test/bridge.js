const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });
const Web3 = require('web3');
const web3 = new Web3(hre.network.provider);

const nonce = 1;
const chainWQ = 1;
const chainETH = 2;
const chainBSC = 3;
const amount = "100000000000000000000";
const newToken = "0x1234567890AbcdEF1234567890aBcdef12345678";
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

describe("Main bridge functions", () => {
    let bridge;
    let token;
    beforeEach(async () => {
        [bridge_owner, sender, recipient, validator, not_validator] = await ethers.getSigners();
        const WQToken = await ethers.getContractFactory("WQToken");
        token = await upgrades.deployProxy(WQToken, [amount], { initializer: 'initialize' });
        await token.transfer(sender.address, amount);

        const Bridge = await ethers.getContractFactory("WQBridge");
        bridge = await Bridge.deploy(chainWQ, token.address);
        await bridge.deployed();
        await bridge.grantRole(await bridge.VALIDATOR_ROLE(), validator.address);
        await bridge.updateChain(chainETH, true);

        await token.setBridge(bridge.address);
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
                await bridge.connect(sender).swap(nonce, chainWQ, amount, recipient.address);
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: Invalid chainTo id");
            }
        });

        it('STEP 2: Swap to disallowed chain: fail', async () => {
            try {
                await bridge.connect(sender).swap(nonce, chainBSC, amount, recipient.address);
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: ChainTo ID is not allowed");
            }
        });

        it('STEP 4: Swap with not empty state: fail', async () => {
            await bridge.connect(sender).swap(nonce, chainETH, amount, recipient.address);

            try {
                await bridge.connect(sender).swap(nonce, chainETH, amount, recipient.address);
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: Swap is not empty state or duplicate transaction");
            }
        });

        it('STEP 5: Success swap:', async () => {
            expect(
                await token.balanceOf(sender.address)
            ).to.be.equal(amount);
            let recipient_addr = recipient.address;
            await bridge.connect(sender).swap(nonce, chainETH, amount, recipient.address);
            message = await web3.utils.soliditySha3(
                { t: 'uint', v: nonce },
                { t: 'uint', v: amount },
                { t: 'address', v: recipient_addr },
                { t: 'uint256', v: chainWQ },
                { t: 'uint256', v: chainETH }
            );
            let data = await bridge.swaps(message);
            expect(data.nonce).to.equal(nonce);
            expect(data.state).to.equal(swapStatus.Initialized);
            expect(
                await token.balanceOf(sender.address)
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
            );
        });

        it('STEP 1: Redeem with same chain id: fail', async () => {
            let signature = await web3.eth.sign(message, validator.address);
            let sig = ethers.utils.splitSignature(signature)
            try {
                await bridge.connect(sender).redeem(
                    nonce,
                    chainWQ,
                    amount,
                    recipient_addr,
                    sig.v,
                    sig.r,
                    sig.s
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
                await bridge.connect(sender).redeem(
                    nonce,
                    chainBSC,
                    amount,
                    recipient_addr,
                    sig.v,
                    sig.r,
                    sig.s
                );
                throw new Error("Not reverted");
            } catch (error) {
                expect(error.message).to.include("WorkQuest Bridge: ChainFrom ID is not allowed");
            }
        });

        it('STEP 3: Should revert if swap already redeemed', async () => {
            let signature = await web3.eth.sign(message, validator.address);
            let sig = ethers.utils.splitSignature(signature)
            await bridge.connect(sender).redeem(
                nonce,
                chainETH,
                amount,
                recipient_addr,
                sig.v,
                sig.r,
                sig.s
            );
            try {
                await bridge.connect(sender).redeem(
                    nonce,
                    chainETH,
                    amount,
                    recipient_addr,
                    sig.v,
                    sig.r,
                    sig.s
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
                await bridge.connect(sender).redeem(
                    nonce,
                    chainETH,
                    amount,
                    recipient_addr,
                    sig.v,
                    sig.r,
                    sig.s
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

            await bridge.connect(sender).redeem(
                nonce,
                chainETH,
                amount,
                recipient_addr,
                sig.v,
                sig.r,
                sig.s
            );
            let data = await bridge.swaps(message);
            expect(data.nonce).to.equal(nonce);
            expect(data.state).to.equal(swapStatus.Redeemed);
            expect(
                await token.balanceOf(recipient.address)
            ).to.be.equal(amount);
        });
    });
    describe('Bridge: admin functions', () => {
        it('STEP1: Add chain id', async () => {
            expect(
                await bridge.chainList(chainBSC)
            ).to.be.equal(false);
            await bridge.updateChain(chainBSC, true);
            expect(
                await bridge.chainList(chainBSC)
            ).to.be.equal(true);
        });
        it('STEP2: Remove chain id', async () => {
            expect(
                await bridge.chainList(chainETH)
            ).to.be.equal(true);
            await bridge.updateChain(chainETH, false);
            expect(
                await bridge.chainList(chainETH)
            ).to.be.equal(false);
        });
        it('STEP3: Set token address', async () => {
            expect(
                await bridge.token()
            ).to.be.equal(token.address);
            await bridge.setToken(newToken);
            expect(
                await bridge.token()
            ).to.be.equal(newToken);
        });
    });
});