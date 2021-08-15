const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });
const Web3 = require('web3');
const { parseEther } = require("ethers/lib/utils");
const web3 = new Web3(hre.network.provider);
const crypto = require('crypto');

const ContributionPeriod = Object.freeze({
    Monthly: 0,
    Yearly: 1
});

const PolicyType = Object.freeze({
    Minimal: 0,
    Medium: 1,
    Maximal: 2
});

describe("Insurance tests", () => {
    let insurance_factory;
    let insurance;
    let accounts;
    let user0;
    let user1;
    let user2;
    let user3;
    let user4;
    let user5;
    let user6;
    let user7;
    let user8;
    let user9;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        [user0, user1, user2, user3, user4, user5, user6, user7, user8, user9] = accounts;
        const InsuranceFactory = await ethers.getContractFactory("WQInsuranceFactory");
        insurance_factory = await InsuranceFactory.deploy();
        await insurance_factory.newInsurance(ContributionPeriod.Monthly, PolicyType.Minimal);
        insurance = await ethers.getContractAt("WQInsurance", (await insurance_factory.getInsurances()).slice(-1).pop());
    });


    describe("Insurance deploy", () => {
        it("STEP1: Should be set contribution period and amount", async () => {
            expect(
                await insurance.contributionPeriod()
            ).to.equal("2592000");
            expect(
                await insurance.contributionAmount()
            ).to.equal("1000000000000000000000");
        });
    });

    describe("Add members", () => {
        it("STEP1: Add member: success", async () => {
            await insurance.addMember(user1.address);
            expect(
                await insurance.memberCount()
            ).to.equal(1);
            let member_info = await insurance.memberInfo(user1.address);
            expect(
                member_info.enabled
            ).to.equal(true);
            expect(
                member_info.lastContribution
            ).to.equal(0);
            expect(
                member_info.contributed
            ).to.equal(0);
        });

        it("STEP2: Add more than 10 members: fail", async () => {
            for (i = 0; i < 10; i++) {
                let priv_key = "0x" + crypto.randomBytes(32).toString('hex');
                let wallet = new ethers.Wallet(priv_key);
                await insurance.addMember(wallet.address);
            }
            expect(
                await insurance.memberCount()
            ).to.equal(10);
            try {
                await insurance.addMember(user1.address);
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Members quantity should be less than 10");
            }
        });

        it("STEP3: Add member again: fail", async () => {
            await insurance.addMember(user1.address);
            expect(
                await insurance.memberCount()
            ).to.equal(1);
            try {
                await insurance.addMember(user1.address);
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Member already registered in contract");
            }
        });
    });

    describe("Remove members", () => {
        it("STEP1: Remove member: success", async () => {
            await insurance.addMember(user1.address);
            expect(
                await insurance.memberCount()
            ).to.equal(1);
            await insurance.connect(user1).removeMember();
            expect(
                await insurance.memberCount()
            ).to.equal(0);
            expect(
                (await insurance.memberInfo(user1.address)).enabled
            ).to.equal(false);
        });

        it("STEP2: Remove member again: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.connect(user1).removeMember();
            expect(
                await insurance.memberCount()
            ).to.equal(0);
            try {
                await insurance.connect(user1).removeMember();
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Member already removed from contract");
            }
        });
    });

    describe("Contribute funds", () => {
        it("STEP1: Contribute funds: success", async () => {
            await insurance.addMember(user1.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            let member_info = await insurance.memberInfo(user1.address);
            expect(
                member_info.contributed
            ).to.equal("0x04847b7925d28d5555");
            expect(
                member_info.enabled
            ).to.equal(true);
        });

        it("STEP2: Contribute from disabled account: fail", async () => {
            try {
                await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Member not found");
            }
        });

        it("STEP3: Contribute wrong funds amount: fail", async () => {
            await insurance.addMember(user1.address);
            try {
                await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: parseEther("1001") });
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Invalid contribution amount");
            }
        });
    });

    describe("Claim funds", () => {
        it("STEP1: Claim funds from contract: success", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            for (i = 0; i < 12; i++) {
                await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            }
            await insurance.connect(user1).claim();
            let ask = await insurance.claims(user1.address);
            expect(ask.active).to.equal(true);
            expect(ask.executed).to.equal(false);
            expect(ask.numConfirm).to.equal(1);
            expect(ask.asked).to.equal("0x2d2cd2bb7a39855552");
            expect(
                await insurance.confirmations(user1.address, user1.address)
            ).to.equal(true);
        });

        it("STEP2: Claim from disabled account: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await insurance.addMember(user3.address);
            await insurance.connect(user1).removeMember();
            try {
                await insurance.connect(user1).claim();
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Member not found");
            }
        });

        it("STEP3: Claim funds with alone member: fail", async () => {
            await insurance.addMember(user1.address);
            try {
                await insurance.connect(user1).claim();
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: The contract must have more than one members");
            }
        });

        it("STEP3: Claim funds when member not contributed funds for a long time: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await hre.ethers.provider.send("evm_increaseTime", [38 * 86400]);
            try {
                await insurance.connect(user1).claim();
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: You haven't contributed funds for a long time");
            }
        });

        it("STEP4: Claim again: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            try {
                await insurance.connect(user1).claim();
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Payment is already asked");
            }
        });

        it("STEP5: Claim funds after execute payment: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            await insurance.connect(user1).executePayment();
            try {
                await insurance.connect(user1).claim();
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Payment is already executed");
            }
        });
    });

    describe("Unclaim", () => {
        it("STEP1: Unclaim: success", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });

            await insurance.connect(user1).claim();
            let ask_info = await insurance.claims(user1.address);
            expect(ask_info.active).to.equal(true);
            expect(ask_info.executed).to.equal(false);
            expect(ask_info.numConfirm).to.equal(1);
            expect(await insurance.confirmations(user1.address, user1.address)).to.equal(true);

            await insurance.connect(user1).unclaim();
            ask_info = await insurance.claims(user1.address);
            expect(ask_info.active).to.equal(false);
            expect(ask_info.executed).to.equal(false);
            expect(ask_info.numConfirm).to.equal(0);
            expect(await insurance.confirmations(user1.address, user1.address)).to.equal(false);
        });
        it("STEP2: Unclaim from disabled member: fail", async () => {
            try {
                await insurance.connect(user1).unclaim();
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Member not found");
            }
        });
        it("STEP3: Unclaim again: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user1).unclaim();
            try {
                await insurance.connect(user1).unclaim();
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Ask is already revoked");
            }

        });
        it("STEP4: Remove executed ask: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            await insurance.connect(user1).executePayment();
            try {
                await insurance.connect(user1).unclaim();
                throw new Error('Not reverted');
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Payment is already executed");
            }
        });
    });

    describe("Confirm payment", () => {
        it("STEP1: Confirm payment: success", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            expect(
                await insurance.confirmations(user1.address, user2.address)
            ).to.equal(true);
            let ask = await insurance.claims(user1.address);
            expect(ask.active).to.equal(true);
            expect(ask.executed).to.equal(false);
            expect(ask.numConfirm).to.equal(2);
        });

        it("STEP2: Confirm payment for disabled member: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user1).removeMember();
            try {
                await insurance.connect(user2).confirmPayment(user1.address);
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Member not found");
            }
        });

        it("STEP3: Confirm payment from disabled member: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).removeMember();
            try {
                await insurance.connect(user2).confirmPayment(user1.address);
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: You are not a member");
            }
        });

        it("STEP4: Confirm payment again: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            try {
                await insurance.connect(user2).confirmPayment(user1.address);
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Payment is already confirmed");
            }
        });
    });

    describe("Revoke confirmation", () => {
        it("STEP1: Revoke confirmation: success", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            expect(
                await insurance.confirmations(user1.address, user2.address)
            ).to.equal(true);
            expect((await insurance.claims(user1.address)).numConfirm).to.equal(2);

            await insurance.connect(user2).revokeConfirmation(user1.address);
            expect((await insurance.claims(user1.address)).numConfirm).to.equal(1);
            expect(
                await insurance.confirmations(user1.address, user2.address)
            ).to.equal(false);
        });

        it("STEP2: Revoke confirmation for disabled member: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            await insurance.connect(user1).removeMember();
            try {
                await insurance.connect(user2).revokeConfirmation(user1.address);
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Member not found");
            }
        });

        it("STEP3: Revoke confirmation from disabled member: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            await insurance.connect(user2).removeMember();
            try {
                await insurance.connect(user2).revokeConfirmation(user1.address);
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: You are not a member");
            }
        });

        it("STEP3: Revoke confirmation again: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            await insurance.connect(user2).revokeConfirmation(user1.address);
            try {
                await insurance.connect(user2).revokeConfirmation(user1.address);
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Payment is already revoked confirmation");
            }
        });

    });

    describe("Execute payment", () => {
        it("STEP1: Execute payment: success", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            expect(
                await insurance.confirmations(user1.address, user2.address)
            ).to.equal(true);
            expect((await insurance.claims(user1.address)).numConfirm).to.equal(2);
            await insurance.connect(user1).executePayment();
        });

        it("STEP2: Execute payment from disabled member: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            await insurance.connect(user1).removeMember();
            try {
                await insurance.connect(user1).executePayment();
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: You are not a member");
            }
        });

        it("STEP3: Execute payment with alone member: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            await insurance.connect(user2).removeMember();
            try {
                await insurance.connect(user1).executePayment();
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: The contract must have more than one members");
            }
        });

        it("STEP4: Execute payment when member not contributed funds for a long time: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            await hre.ethers.provider.send("evm_increaseTime", [38 * 86400]);
            try {
                await insurance.connect(user1).executePayment();
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: You haven't contributed funds for a long time");
            }
        });

        it("STEP5: Execute payment when ask removed: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            await insurance.connect(user1).unclaim();
            try {
                await insurance.connect(user1).executePayment();
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Payment is not asked");
            }
        });

        it("STEP6: Execute payment when payments is already executed: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            await insurance.connect(user2).confirmPayment(user1.address);
            await insurance.connect(user1).executePayment();
            try {
                await insurance.connect(user1).executePayment();
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Payment is already executed");
            }
        });

        it("STEP7: Execute payment: fail", async () => {
            await insurance.addMember(user1.address);
            await insurance.addMember(user2.address);
            await web3.eth.sendTransaction({ from: user1.address, to: insurance.address, value: "0x04847b7925d28d5555" });
            await insurance.connect(user1).claim();
            try {
                await insurance.connect(user1).executePayment();
            } catch (e) {
                await expect(e.message).to.include("WQInsurance: Payment is not confirmed");
            }
        });
    });
});