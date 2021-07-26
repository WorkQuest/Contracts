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
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }
    if (!process.env.BRIDGE_TOKEN_NAME) {
        throw new Error(`Please set your BRIDGE_TOKEN_NAME in a .env-${network} file`);
    }
    if (!process.env.BRIDGE_TOKEN_SYMBOL) {
        throw new Error(`Please set your BRIDGE_TOKEN_SYMBOL in a .env-${network} file`);
    }
    if (!process.env.BRIDGE) {
        throw new Error(`Please set your BRIDGE in a .env-${network} file`);
    }

    console.log("Deploying...");
    const BridgeToken = await hre.ethers.getContractFactory("BridgeToken");
    const bridge_token = await BridgeToken.deploy(process.env.BRIDGE_TOKEN_NAME, process.env.BRIDGE_TOKEN_SYMBOL);
    await bridge_token.deployed();
    await bridge_token.grantRole(await bridge_token.BRIDGE_ROLE(), process.env.BRIDGE);

    console.log(`${process.env.BRIDGE_TOKEN_NAME} has been deployed to:`, bridge_token.address);

    envConfig[`STAKE_TOKEN`] = bridge_token.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });