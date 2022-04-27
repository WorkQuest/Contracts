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
    if (!process.env.LENDING_APY) {
        throw new Error(`Please set your LENDING_APY in a .env-${network} file`);
    }
    if (!process.env.WUSD_TOKEN) {
        throw new Error(`Please set your WUSD_TOKEN in a .env-${network} file`);
    }
    if (!process.env.LENDING_FEE_RECEIVER) {
        throw new Error(`Please set your LENDING_FEE_RECEIVER in a .env-${network} file`);
    }
    if (!process.env.LENDING_FEE) {
        throw new Error(`Please set your LENDING_FEE in a .env-${network} file`);
    }
    console.log("Deploying...");
    const Lending = await hre.ethers.getContractFactory("WQLending");
    const lending = await upgrades.deployProxy(
        Lending,
        [
            process.env.LENDING_APY,
            process.env.WUSD_TOKEN,
            process.env.LENDING_FEE_RECEIVER,
            process.env.LENDING_FEE
        ],
        { initializer: 'initialize' })
    console.log("Lending has been deployed to:", lending.address);

    envConfig["LENDING"] = lending.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
