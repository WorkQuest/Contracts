task("config_workquest", "Config workquest")
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
        if (!process.env.WORK_QUEST_FACTORY) {
            throw new Error(`Please set your WORK_QUEST_FACTORY in a .env-${network} file`);
        }
        if (!process.env.WORKQUEST_FEE_EMPLOYER) {
            throw new Error(`Please set your WORKQUEST_FEE_EMPLOYER in a .env-${network} file`);
        }
        if (!process.env.WORKQUEST_FEE_WORKER) {
            throw new Error(`Please set your WORKQUEST_FEE_WORKER in a .env-${network} file`);
        }
        if (!process.env.WORKQUEST_FEE_TX) {
            throw new Error(`Please set your WORKQUEST_FEE_TX in a .env-${network} file`);
        }
        if (!process.env.WORKQUEST_FEE_RECEIVER) {
            throw new Error(`Please set your WORKQUEST_FEE_RECEIVER in a .env-${network} file`);
        }
        if (!process.env.PENSION_FUND) {
            throw new Error(`Please set your PENSION_FUND in a .env-${network} file`);
        }
        if (!process.env.REFERRAL) {
            throw new Error(`Please set your REFERRAL in a .env-${network} file`);
        }
        if (!process.env.WUSD_TOKEN) {
            throw new Error(`Please set your WUSD_TOKEN in a .env-${network} file`);
        }
        let factory = await ethers.getContractAt("WorkQuestFactory", process.env.WORK_QUEST_FACTORY);
        console.log("Try to config referral...");
        // await factory.setOracle(process.env.PRICE_ORACLE);
        // await factory.setFeeReceiver(process.env.WORKQUEST_FEE_RECEIVER);
        // await factory.setRefferal(process.env.REFERRAL);
        // await factory.setPensionFund(process.env.PENSION_FUND);
        // await factory.setWusd(process.env.WUSD_TOKEN);
        // await factory.setFeeEmployer(process.env.WORKQUEST_FEE_EMPLOYER);
        // await factory.setFeeWorker(process.env.WORKQUEST_FEE_WORKER);
        // await factory.setFeeTx(process.env.WORKQUEST_FEE_TX);
        console.log("Done.")
    });