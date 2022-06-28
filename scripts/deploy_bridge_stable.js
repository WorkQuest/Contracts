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
    if (!process.env.STABLE_BRIDGE_TOKEN_RECEIVER) {
        throw new Error(`Please set your STABLE_BRIDGE_TOKEN_RECEIVER in a .env-${network} file`);
    }

    console.log("Deploying...");

    const Bridge = await hre.ethers.getContractFactory("WQBridgeStable");
    const bridge = await upgrades.deployProxy(Bridge,
        [
            process.env.CHAIN_ID,
            process.env.STABLE_BRIDGE_TOKEN_RECEIVER
        ], { initializer: 'initialize', kind: "transparent" });
    console.log("WorkQuest Bridge has been deployed to:", bridge.address);

    envConfig["STABLE_BRIDGE"] = bridge.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
