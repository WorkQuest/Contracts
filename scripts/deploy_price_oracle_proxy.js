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
    if (!process.env.PRICE_ORACLE_SERVICE) {
        throw new Error(`Please set your PRICE_ORACLE_SERVICE in a .env-${network} file`);
    }

    if (!process.env.PRICE_ORACLE_VALID_BLOCKS) {
        throw new Error(`Please set your PRICE_ORACLE_VALID_BLOCKS in a .env-${network} file`);
    }

    console.log("Deploying...");
    const PriceOracle = await hre.ethers.getContractFactory("WQPriceOracle");
    const price_oracle = await upgrades.deployProxy(PriceOracle, [process.env.PRICE_ORACLE_SERVICE, process.env.PRICE_ORACLE_VALID_BLOCKS], { initializer: 'initialize' })
    console.log("Price Oracle has been deployed to:", price_oracle.address);

    envConfig["PRICE_ORACLE"] = price_oracle.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
