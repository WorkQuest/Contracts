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

    if (!process.env.DEBT_AUCTION) {
        throw new Error(`Please set your DEBT_AUCTION in a .env-${network} file`);
    }
    const DebtAuction = await ethers.getContractFactory("WQDebtAuction");
    console.log("Upgrade...");
    const auction = await upgrades.upgradeProxy(process.env.DEBT_AUCTION, DebtAuction);
    console.log("Debt auction has been upgraded to:", auction.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });