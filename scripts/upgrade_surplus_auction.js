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
    for (const k in envConfig) { process.env[k] = envConfig[k]; }

    if (!process.env.SURPLUS_AUCTION) {
        throw new Error(`Please set your SURPLUS_AUCTION in a .env-${network} file`);
    }
    const SurplusAuction = await ethers.getContractFactory("WQSurplusAuction");
    console.log("Upgrade...");
    const auction = await upgrades.upgradeProxy(process.env.SURPLUS_AUCTION, SurplusAuction);
    console.log("Debt auction has been upgraded to:", auction.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });