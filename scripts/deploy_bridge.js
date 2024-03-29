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
    for ( const k in envConfig ) {
        process.env[k] = envConfig[k];
    }
    
    if (!process.env.CHAIN_ID) {
        throw new Error(`Please set your CHAIN_ID in a .env-${network} file`);
    }
    if (!process.env.BRIDGE_POOL) {
        throw new Error(`Please set your BRIDGE_POOL in a .env-${network} file`);
    }
    if (!process.env.BRIDGE_VALIDATOR) {
        throw new Error(`Please set your BRIDGE_VALIDATOR in a .env-${network} file`);
    }
    
    console.log("Deploying...");

    const Bridge = await hre.ethers.getContractFactory('WQBridge')
    const bridge = await upgrades.deployProxy(
        Bridge,
        [
            process.env.CHAIN_ID,
            process.env.BRIDGE_POOL,
            process.env.BRIDGE_VALIDATOR,
        ],
        {
            initializer: 'initialize',
            kind: 'uups',
        }
    )

    console.log("WorkQuest Bridge has been deployed to:", bridge.address);

    envConfig["BRIDGE"] = bridge.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
