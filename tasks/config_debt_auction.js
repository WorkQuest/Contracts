task("config_debt_auction", "Config debt auction")
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
        if (!process.env.DEBT_AUCTION) {
            throw new Error(`Please set your DEBT_AUCTION in a .env-${network} file`);
        }
        if (!process.env.DEBT_AUCTION_UPPER_BOUND_COST) {
            throw new Error(`Please set your DEBT_AUCTION_UPPER_BOUND_COST in a .env-${network} file`);
        }
        if (!process.env.DEBT_AUCTION_LOWER_BOUND_COST) {
            throw new Error(`Please set your DEBT_AUCTION_LOWER_BOUND_COST in a .env-${network} file`);
        }
        if (!process.env.DEBT_AUCTION_DURATION) {
            throw new Error(`Please set your DEBT_AUCTION_DURATION in a .env-${network} file`);
        }
        if (!process.env.DEBT_MAX_LOT_AMOUNT_FACTOR) {
            throw new Error(`Please set your DEBT_MAX_LOT_AMOUNT_FACTOR in a .env-${network} file`);
        }
        let auction = await ethers.getContractAt("WQDebtAuction", process.env.DEBT_AUCTION);
        console.log("Try to config debt auction...");
        // await auction.setUpperBoundCost(process.env.DEBT_AUCTION_UPPER_BOUND_COST);
        // await auction.setLowerBoundCost(process.env.DEBT_AUCTION_LOWER_BOUND_COST);
        // await auction.setAuctionDuration(process.env.DEBT_AUCTION_DURATION);
        // await auction.setMaxLotAmountFactor(process.env.DEBT_MAX_LOT_AMOUNT_FACTOR);
        // await auction.setRouter(process.env.ROUTER);
        await auction.setToken(1, "ETH");
        await auction.setToken(1, "BNB");
        await auction.setToken(1, "USDT");
        console.log("Done.")
    });