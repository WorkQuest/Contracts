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

    const Pool = await hre.ethers.getContractFactory("WQBridgePool");
    console.log("Deploying...");
    const pool = await upgrades.deployProxy(Pool, [], {
        initializer: 'initialize',
        kind: 'uups',
    })
    await pool.deployed();
    console.log("Bridge pool has been deployed to:", pool.address);
    envConfig["BRIDGE_POOL"] = pool.address;

    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
