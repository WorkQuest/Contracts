const { ethers, upgrades } = require("hardhat");
const dotenv = require('dotenv');
const fs = require('fs');
const stringify = require('dotenv-stringify');

async function main() {
    dotenv.config();
    const accounts = await ethers.getSigners();
    const sender = accounts[0].address;
    console.log("Sender address: ", sender);

    const network = hre.network.name;
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) { process.env[k] = envConfig[k]; }
    if (!process.env.PRICE_ORACLE) {
        throw new Error(`Please set your PRICE_ORACLE in a .env-${network} file`);
    }
    if (!process.env.ROUTER) {
        throw new Error(`Please set your ROUTER in a .env-${network} file`);
    }

    const Auction = await hre.ethers.getContractFactory("WQCollateralAuction");
    console.log("Deploying...");

    if (!process.env.ETH_TOKEN) {
        throw new Error(`Please set your ETH_TOKEN in a .env-${network} file`);
    }
    if (!process.env.ETH_AUCTION_LIQUIDATE_TRESHOLD) {
        throw new Error(`Please set your ETH_AUCTION_LIQUIDATE_TRESHOLD in a .env-${network} file`);
    }
    if (!process.env.ETH_AUCTION_UPPER_BOUND_COST) {
        throw new Error(`Please set your ETH_AUCTION_UPPER_BOUND_COST in a .env-${network} file`);
    }
    if (!process.env.ETH_AUCTION_LOWER_BOUND_COST) {
        throw new Error(`Please set your ETH_AUCTION_LOWER_BOUND_COST in a .env-${network} file`);
    }
    if (!process.env.ETH_AUCTION_DURATION) {
        throw new Error(`Please set your ETH_AUCTION_DURATION in a .env-${network} file`);
    }
    const eth_auction = await upgrades.deployProxy(Auction,
        [
            process.env.ETH_TOKEN,
            process.env.PRICE_ORACLE,
            process.env.ROUTER,
            process.env.ETH_AUCTION_LIQUIDATE_TRESHOLD,
            process.env.ETH_AUCTION_UPPER_BOUND_COST,
            process.env.ETH_AUCTION_LOWER_BOUND_COST,
            process.env.ETH_AUCTION_DURATION
        ], { initializer: 'initialize' });
    console.log("ETH collateral auction has been deployed to:", eth_auction.address);
    envConfig["ETH_AUCTION"] = eth_auction.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));


    if (!process.env.BNB_TOKEN) {
        throw new Error(`Please set your BNB_TOKEN in a .env-${network} file`);
    }
    if (!process.env.BNB_AUCTION_LIQUIDATE_TRESHOLD) {
        throw new Error(`Please set your BNB_AUCTION_LIQUIDATE_TRESHOLD in a .env-${network} file`);
    }
    if (!process.env.BNB_AUCTION_UPPER_BOUND_COST) {
        throw new Error(`Please set your BNB_AUCTION_UPPER_BOUND_COST in a .env-${network} file`);
    }
    if (!process.env.BNB_AUCTION_LOWER_BOUND_COST) {
        throw new Error(`Please set your BNB_AUCTION_LOWER_BOUND_COST in a .env-${network} file`);
    }
    if (!process.env.BNB_AUCTION_DURATION) {
        throw new Error(`Please set your BNB_AUCTION_DURATION in a .env-${network} file`);
    }
    const bnb_auction = await upgrades.deployProxy(Auction,
        [
            process.env.BNB_TOKEN,
            process.env.PRICE_ORACLE,
            process.env.ROUTER,
            process.env.BNB_AUCTION_LIQUIDATE_TRESHOLD,
            process.env.BNB_AUCTION_UPPER_BOUND_COST,
            process.env.BNB_AUCTION_LOWER_BOUND_COST,
            process.env.BNB_AUCTION_DURATION
        ], { initializer: 'initialize' });
    console.log("BNB collateral auction has been deployed to:", bnb_auction.address);
    envConfig["BNB_AUCTION"] = bnb_auction.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));


    if (!process.env.USDT_TOKEN) {
        throw new Error(`Please set your USDT_TOKEN in a .env-${network} file`);
    }
    if (!process.env.USDT_AUCTION_LIQUIDATE_TRESHOLD) {
        throw new Error(`Please set your USDT_AUCTION_LIQUIDATE_TRESHOLD in a .env-${network} file`);
    }
    if (!process.env.USDT_AUCTION_UPPER_BOUND_COST) {
        throw new Error(`Please set your USDT_AUCTION_UPPER_BOUND_COST in a .env-${network} file`);
    }
    if (!process.env.USDT_AUCTION_LOWER_BOUND_COST) {
        throw new Error(`Please set your USDT_AUCTION_LOWER_BOUND_COST in a .env-${network} file`);
    }
    if (!process.env.USDT_AUCTION_DURATION) {
        throw new Error(`Please set your USDT_AUCTION_DURATION in a .env-${network} file`);
    }
    const usdt_auction = await upgrades.deployProxy(Auction,
        [
            process.env.USDT_TOKEN,
            process.env.PRICE_ORACLE,
            process.env.ROUTER,
            process.env.USDT_AUCTION_LIQUIDATE_TRESHOLD,
            process.env.USDT_AUCTION_UPPER_BOUND_COST,
            process.env.USDT_AUCTION_LOWER_BOUND_COST,
            process.env.USDT_AUCTION_DURATION
        ],
        { initializer: 'initialize', kind: 'uups' }
    );
    console.log("USDT collateral auction has been deployed to:", usdt_auction.address);
    envConfig["USDT_AUCTION"] = usdt_auction.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));


    if (!process.env.USDC_TOKEN) {
        throw new Error(`Please set your USDC_TOKEN in a .env-${network} file`);
    }
    if (!process.env.USDC_AUCTION_LIQUIDATE_TRESHOLD) {
        throw new Error(`Please set your USDC_AUCTION_LIQUIDATE_TRESHOLD in a .env-${network} file`);
    }
    if (!process.env.USDC_AUCTION_UPPER_BOUND_COST) {
        throw new Error(`Please set your USDC_AUCTION_UPPER_BOUND_COST in a .env-${network} file`);
    }
    if (!process.env.USDC_AUCTION_LOWER_BOUND_COST) {
        throw new Error(`Please set your USDC_AUCTION_LOWER_BOUND_COST in a .env-${network} file`);
    }
    if (!process.env.USDC_AUCTION_DURATION) {
        throw new Error(`Please set your USDC_AUCTION_DURATION in a .env-${network} file`);
    }
    const usdc_auction = await upgrades.deployProxy(Auction,
        [
            process.env.USDC_TOKEN,
            process.env.PRICE_ORACLE,
            process.env.ROUTER,
            process.env.USDC_AUCTION_LIQUIDATE_TRESHOLD,
            process.env.USDC_AUCTION_UPPER_BOUND_COST,
            process.env.USDC_AUCTION_LOWER_BOUND_COST,
            process.env.USDC_AUCTION_DURATION
        ],
        { initializer: 'initialize', kind: 'uups' }
    );
    console.log("USDC collateral auction has been deployed to:", usdc_auction.address);
    envConfig["USDC_AUCTION"] = usdc_auction.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });