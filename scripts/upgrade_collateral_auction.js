const { ethers, upgrades } = require("hardhat");
const dotenv = require('dotenv');
const fs = require('fs');

async function main() {
    dotenv.config();
    const accounts = await ethers.getSigners();
    const sender = accounts[0].address;
    console.log("Sender address: ", sender);

    const network = hre.network.name;
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }

    console.log("Upgrade...");
    const CollateralAuction = await ethers.getContractFactory("WQCollateralAuction");

    if (!process.env.ETH_AUCTION) {
        throw new Error(`Please set your ETH_AUCTION in a .env-${network} file`);
    }
    const eth_auction = await upgrades.upgradeProxy(process.env.ETH_AUCTION, CollateralAuction);
    console.log("ETH collateral auction has been upgraded to:", eth_auction.address);

    if (!process.env.BNB_AUCTION) {
        throw new Error(`Please set your BNB_AUCTION in a .env-${network} file`);
    }
    const bnb_auction = await upgrades.upgradeProxy(process.env.BNB_AUCTION, CollateralAuction);
    console.log("BNB collateral auction has been upgraded to:", bnb_auction.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });