task("config_collateral_auction", "Config collateral auction")
    .addParam("token", "Token symbol")
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
        let auction_address = process.env[`${args.token}_AUCTION`];
        if (!auction_address) {
            throw new Error(`Please set your ${args.token}_AUCTION in a .env-${network} file`);
            S
        }
        let liquidate_threshold = process.env[`${args.token}_AUCTION_LIQUIDATE_TRESHOLD`];
        if (!liquidate_threshold) {
            throw new Error(`Please set your ${args.token}_AUCTION_LIQUIDATE_TRESHOLD in a .env-${network} file`);
        }
        let auction_duration = process.env[`${args.token}_AUCTION_DURATION`];
        if (!auction_duration) {
            throw new Error(`Please set your ${args.token}_AUCTION_DURATION in a .env-${network} file`);
        }

        let auction = await ethers.getContractAt("WQCollateralAuction", auction_address);
        console.log("Try to config collateral auction:", args.token, auction_address);

        // await auction.setLiquidateTreshold(liquidate_threshold);
        // await auction.setAuctionDuration(auction_duration);
        //  await auction.setOracle(oracle_address)
        //  await auction.setToken(token_address)
        // await auction.setRate(feeRewards, feePlatform, feeReserves)
        await auction.setRouter(process.env.ROUTER);

        console.log("Done")
    });