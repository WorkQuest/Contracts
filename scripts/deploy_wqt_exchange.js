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
    if (!process.env.OLD_WQT_TOKEN) {
        throw new Error(`Please set your OLD_WQT_TOKEN in a .env-${network} file`);
    }

    console.log("Deploying...");
    const WQTExchange = await hre.ethers.getContractFactory("WQTExchange");
    const exchange = await WQTExchange.deploy(process.env.OLD_WQT_TOKEN, process.env.WORK_QUEST_TOKEN);
    await exchange.deployed();
    console.log("WQT tokens exchange contract has been deployed to:", exchange.address);

    envConfig["WQT_EXCHANGE"] = exchange.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));

    const WQToken = await hre.ethers.getContractAt("WQToken", process.env.WORK_QUEST_TOKEN);
    await WQToken.grantRole(await WQToken.MINTER_ROLE(), exchange.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
