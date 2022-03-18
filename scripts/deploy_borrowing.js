const { ethers, upgrades } = require("hardhat");
const hre = require("hardhat");
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
    if (!process.env.BORROWING_FIXED_RATE) {
        throw new Error(`Please set your BORROWING_FIXED_RATE in a .env-${network} file`);
    }

    console.log("Deploying...");
    const Borrowing = await hre.ethers.getContractFactory("WQBorrowing");
    const borrowing = await upgrades.deployProxy(Borrowing, [process.env.PRICE_ORACLE, process.env.BORROWING_FIXED_RATE], { initializer: 'initialize' })
    console.log("PensionFund has been deployed to:", borrowing.address);

    envConfig["BORROWING"] = borrowing.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
