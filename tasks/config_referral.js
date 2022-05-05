task("config_referral", "Config referral")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }
        if (!process.env.REFERRAL) {
            throw new Error(`Please set your REFERRAL in a .env-${network} file`);
        }
        if (!process.env.WORK_QUEST_FACTORY) {
            throw new Error(`Please set your WORK_QUEST_FACTORY in a .env-${network} file`);
        }
        if (!process.env.REFERRAL_REWARD) {
            throw new Error(`Plese set your REFERRAL_REWARD in a .env-${network} file`)
        }
        if (!process.env.PRICE_ORACLE) {
            throw new Error(`Plese set your PRICE_ORACLE in a .env-${network} file`)
        }
        if (!process.env.REFERRAL_SERVICE) {
            throw new Error(`Plese set your REFERRAL_SERVICE in a .env-${network} file`)
        }
        if (!process.env.REFERRAL_EARNED_THRESHOLD) {
            throw new Error(`Plese set your REFERRAL_EARNED_THRESHOLD in a .env-${network} file`)
        }
        let referral = await ethers.getContractAt("WQReferral", process.env.REFERRAL);
        console.log("Try to config referral...");
        await referral.setFactory(process.env.WORK_QUEST_FACTORY);
        await web3.eth.sendTransaction({ from: accounts[0].address, to: referral.address, value: "100000000000000000000000" });
        // await referral.setOracle(process.env.PRICE_ORACLE);
        // await referral.setReferralBonus(process.env.REFERRAL_REWARD);
        // await referral.setEarnedThreshold(process.env.REFERRAL_EARNED_THRESHOLD);
        console.log("Done.")
    });