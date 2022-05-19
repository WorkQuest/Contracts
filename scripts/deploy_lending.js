const { ethers, upgrades } = require("hardhat");
const hre = require("hardhat");
const dotenv = require('dotenv');
const fs = require('fs');
const stringify = require('dotenv-stringify');
const { parseEther } = require("ethers/lib/utils");

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
            process.env.WUSD_TOKEN,
            process.env.LENDING_FEE_RECEIVER,
            process.env.LENDING_FEE
        ],
        { initializer: 'initialize' })
    console.log("Lending has been deployed to:", lending.address);

    envConfig["LENDING"] = lending.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));

    await lending.setApy(7, parseEther("0.1210"));
    await lending.setApy(14, parseEther("0.1242"));
    await lending.setApy(21, parseEther("0.1268"));
    await lending.setApy(28, parseEther("0.1330"));
    await lending.setApy(35, parseEther("0.1354"));
    console.log("APY setting complete");
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
