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

    console.log("Deploying...");
    const Lending = await hre.ethers.getContractFactory("WQLending");
    const lending = await upgrades.deployProxy(Lending, [process.env.LENDING_APY], { initializer: 'initialize' })
    console.log("PensionFund has been deployed to:", lending.address);

    envConfig["LENDING"] = lending.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
