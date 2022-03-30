task("config_surplus_auction", "Config surplus auction")
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
        if (!process.env.SURPLUS_AUCTION) {
            throw new Error(`Please set your SURPLUS_AUCTION in a .env-${network} file`);
        }
        if (!process.env.SURPLUS_AUCTION_UPPER_BOUND_COST) {
            throw new Error(`Please set your SURPLUS_AUCTION_UPPER_BOUND_COST in a .env-${network} file`);
        }
        if (!process.env.SURPLUS_AUCTION_LOWER_BOUND_COST) {
            throw new Error(`Please set your SURPLUS_AUCTION_LOWER_BOUND_COST in a .env-${network} file`);
        }
        if (!process.env.SURPLUS_AUCTION_DURATION) {
            throw new Error(`Please set your SURPLUS_AUCTION_DURATION in a .env-${network} file`);
        }
        if (!process.env.SURPLUS_MAX_LOT_AMOUNT_FACTOR) {
            throw new Error(`Please set your SURPLUS_MAX_LOT_AMOUNT_FACTOR in a .env-${network} file`);
        }
        let auction = await ethers.getContractAt("WQSurplusAuction", process.env.SURPLUS_AUCTION);
        console.log("Try to config surplus auction...");
        // await auction.setUpperBoundCost(process.env.SURPLUS_AUCTION_UPPER_BOUND_COST);
        // await auction.setLowerBoundCost(process.env.SURPLUS_AUCTION_LOWER_BOUND_COST);
        // await auction.setAuctionDuration(process.env.SURPLUS_AUCTION_DURATION);
        // await auction.setMaxLotAmountFactor(process.env.SURPLUS_MAX_LOT_AMOUNT_FACTOR);
        await auction.setRouter(process.env.ROUTER);
        console.log("Done.")
    });