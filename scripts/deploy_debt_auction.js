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
    if (!process.env.DEBT_AUCTION_DURATION) {
        throw new Error(`Please set your DEBT_AUCTION_DURATION in a .env-${network} file`);
    }
    if (!process.env.DEBT_AUCTION_UPPER_BOUND_COST) {
        throw new Error(`Please set your DEBT_AUCTION_UPPER_BOUND_COST in a .env-${network} file`);
    }
    if (!process.env.DEBT_AUCTION_LOWER_BOUND_COST) {
        throw new Error(`Please set your DEBT_AUCTION_LOWER_BOUND_COST in a .env-${network} file`);
    }

    if (!process.env.DEBT_MAX_LOT_AMOUNT_FACTOR) {
        throw new Error(`Please set your DEBT_MAX_LOT_AMOUNT_FACTOR in a .env-${network} file`);
    }
    console.log("Deploying...");
    const Auction = await ethers.getContractFactory("WQDebtAuction");
    const auction = await upgrades.deployProxy(
        Auction,
        [
            process.env.PRICE_ORACLE,
            process.env.ROUTER,
            process.env.DEBT_AUCTION_DURATION,
            process.env.DEBT_AUCTION_UPPER_BOUND_COST,
            process.env.DEBT_AUCTION_LOWER_BOUND_COST,
            process.env.DEBT_MAX_LOT_AMOUNT_FACTOR
        ],
        { initializer: 'initialize' });
    console.log("Debt auction has been deployed to:", auction.address);
    envConfig["DEBT_AUCTION"] = auction.address;

    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });