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
    if (!process.env.CHAIN_ID) {
        throw new Error(`Please set your CHAIN_ID in a .env-${network} file`);
    }

    console.log("Deploying...");
    const Pool = await hre.ethers.getContractFactory("WQBridgePool");
    const pool = await upgrades.deployProxy(Pool, [], { initializer: 'initialize' });
    await pool.deployed();
    envConfig["BRIDGE_POOL"] = pool.address;
    console.log("Bridge pool has been deployed to:", pool.address);

    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });