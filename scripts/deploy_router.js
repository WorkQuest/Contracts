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
    if (!process.env.WUSD_TOKEN) {
        throw new Error(`Please set your WUSD_TOKEN in a .env-${network} file`);
    }


    console.log("Deploying...");
    const Router = await ethers.getContractFactory("WQRouter");
    const router = await upgrades.deployProxy(
        Router,
        [
            process.env.PRICE_ORACLE,
            process.env.WUSD_TOKEN
        ],
        { initializer: 'initialize', kind: 'uups' }
    );
    console.log("Router has been deployed to:", router.address);

    envConfig["ROUTER"] = router.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });