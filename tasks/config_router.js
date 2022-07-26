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
        // if (!process.env.ROUTER_FIXED_RATE) {
        //     throw new Error(`Please set your ROUTER_FIXED_RATE in a .env-${network} file`);
        // }
        // if (!process.env.ROUTER_ANNUAL_INTEREST_RATE) {
        //     throw new Error(`Please set your ROUTER_ANNUAL_INTEREST_RATE in a .env-${network} file`);
        // }
        // if (!process.env.DEBT_AUCTION) {
        //     throw new Error(`Please set your DEBT_AUCTION in a .env-${network} file`);
        // }
        // if (!process.env.SURPLUS_AUCTION) {
        //     throw new Error(`Please set your SURPLUS_AUCTION in a .env-${network} file`);
        // }
        // if (!process.env.PRICE_ORACLE) {
        //     throw new Error(`Please set your PRICE_ORACLE in a .env-${network} file`);
        // }
        // if (!process.env.ETH_TOKEN) {
        //     throw new Error(`Please set your ETH_TOKEN in a .env-${network} file`);
        // }
        // if (!process.env.ETH_AUCTION) {
        //     throw new Error(`Please set your ETH_AUCTION in a .env-${network} file`);
        // }
        // if (!process.env.ETH_AUCTION_MIN_RATIO) {
        //     throw new Error(`Please set your ETH_AUCTION_MIN_RATIO in a .env-${network} file`);
        // }
        // if (!process.env.BNB_TOKEN) {
        //     throw new Error(`Please set your BNB_TOKEN in a .env-${network} file`);
        // }
        // if (!process.env.BNB_AUCTION) {
        //     throw new Error(`Please set your BNB_AUCTION in a .env-${network} file`);
        // }
        // if (!process.env.BNB_AUCTION_MIN_RATIO) {
        //     throw new Error(`Please set your BNB_AUCTION_MIN_RATIO in a .env-${network} file`);
        // }
        // if (!process.env.USDT_TOKEN) {
        //     throw new Error(`Please set your USDT_TOKEN in a .env-${network} file`);
        // }
        // if (!process.env.USDT_AUCTION) {
        //     throw new Error(`Please set your USDT_AUCTION in a .env-${network} file`);
        // }
        // if (!process.env.USDT_AUCTION_MIN_RATIO) {
        //     throw new Error(`Please set your USDT_AUCTION_MIN_RATIO in a .env-${network} file`);
        // }
        if (!process.env.USDC_TOKEN) {
            throw new Error(`Please set your USDC_TOKEN in a .env-${network} file`);
        }
        if (!process.env.USDC_AUCTION) {
            throw new Error(`Please set your USDC_AUCTION in a .env-${network} file`);
        }
        if (!process.env.USDC_AUCTION_MIN_RATIO) {
            throw new Error(`Please set your USDC_AUCTION_MIN_RATIO in a .env-${network} file`);
        }
        const router = await hre.ethers.getContractAt("WQRouter", process.env.ROUTER);
        console.log("Try to config router:", router.address);
        // await router.setRate(process.env.ROUTER_FIXED_RATE, process.env.ROUTER_ANNUAL_INTEREST_RATE);
        // await router.setContracts(process.env.PRICE_ORACLE, process.env.DEBT_AUCTION, process.env.SURPLUS_AUCTION);
        // await router.setToken(1, process.env.ETH_TOKEN, process.env.ETH_AUCTION, process.env.ETH_AUCTION_MIN_RATIO, "ETH");
        // await router.setToken(1, process.env.BNB_TOKEN, process.env.BNB_AUCTION, process.env.BNB_AUCTION_MIN_RATIO, "BNB");
        // await router.setToken(1, process.env.USDT_TOKEN, process.env.USDT_AUCTION, process.env.USDT_AUCTION_MIN_RATIO, "USDT");
        await router.setToken(1, process.env.USDC_TOKEN, process.env.USDC_AUCTION, process.env.USDC_AUCTION_MIN_RATIO, "USDC");

        // const wusd = await ethers.getContractAt("WQBridgeToken", process.env.WUSD_TOKEN);
        // await wusd.grantRole(await wusd.MINTER_ROLE(), router.address);
        // await wusd.grantRole(await wusd.BURNER_ROLE(), router.address);
        console.log("Done")
    });