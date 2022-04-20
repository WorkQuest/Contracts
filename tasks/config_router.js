task("config_router", "Config router")
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
        if (!process.env.ROUTER) {
            throw new Error(`Please set your ROUTER in a .env-${network} file`);
        }
        if (!process.env.ROUTER_FIXED_RATE) {
            throw new Error(`Please set your ROUTER_FIXED_RATE in a .env-${network} file`);
        }
        if (!process.env.ROUTER_ANNUAL_INTEREST_RATE) {
            throw new Error(`Please set your ROUTER_ANNUAL_INTEREST_RATE in a .env-${network} file`);
        }
        if (!process.env.DEBT_AUCTION) {
            throw new Error(`Please set your DEBT_AUCTION in a .env-${network} file`);
        }
        if (!process.env.SURPLUS_AUCTION) {
            throw new Error(`Please set your SURPLUS_AUCTION in a .env-${network} file`);
        }
        if (!process.env.ETH_TOKEN) {
            throw new Error(`Please set your ETH_TOKEN in a .env-${network} file`);
        }
        if (!process.env.ETH_AUCTION) {
            throw new Error(`Please set your ETH_AUCTION in a .env-${network} file`);
        }
        if (!process.env.BNB_TOKEN) {
            throw new Error(`Please set your ETH_TOKEN in a .env-${network} file`);
        }
        if (!process.env.BNB_AUCTION) {
            throw new Error(`Please set your BNB_AUCTION in a .env-${network} file`);
        }

        const router = await hre.ethers.getContractAt("WQRouter", process.env.ROUTER);
        console.log("Try to config router:", router.address);
        // await router.updateFixedRate(process.env.ROUTER_FIXED_RATE);
        // await router.updateAnnualInterestRate(process.env.ROUTER_ANNUAL_INTEREST_RATE);
        // await router.setDebtAuction(process.env.DEBT_AUCTION);
        // await router.setSurplusAuction(process.env.SURPLUS_AUCTION);
        // await router.addToken(process.env.ETH_TOKEN, process.env.ETH_AUCTION, "ETH");
        // await router.addToken(process.env.BNB_TOKEN, process.env.BNB_AUCTION, "BNB");
        // await router.addToken(process.env.WQT_TOKEN, process.env.WQT_AUCTION, "WQT");
        // await router.updateToken(1, process.env.ETH_TOKEN, process.env.ETH_AUCTION, "ETH");
        // await router.updateToken(1, process.env.BNB_TOKEN, process.env.BNB_AUCTION, "BNB");
        // await router.updateToken(1, process.env.WQT_TOKEN, process.env.WQT_AUCTION, "WQT");
        console.log("Done")
    });