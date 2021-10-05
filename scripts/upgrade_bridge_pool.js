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

    console.log("Upgrade...");
    const WQBridgePool = await ethers.getContractFactory("WQBridgePool");
    const bridge_pool = await upgrades.upgradeProxy(process.env.BRIDGE_POOL, WQBridgePool);
    console.log("Bridge Pool has been upgraded to:", bridge_pool.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
