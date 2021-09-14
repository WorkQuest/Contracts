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
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }
    if (!process.env.REWARD_TOTAL) {
        throw new Error(`Please set your REWARD_TOTAL in a .env-${network} file`);
    }
    if (!process.env.START_TIME) {
        throw new Error(`Please set your START_TIME in a .env-${network} file`);
    }
    if (!process.env.DISTRIBUTION_TIME) {
        throw new Error(`Please set your DISTRIBUTION_TIME in a .env-${network} file`);
    }
    if (!process.env.STAKE_PERIOD) {
        throw new Error(`Please set your STAKE_PERIOD in a .env-${network} file`);
    }
    if (!process.env.CLAIM_PERIOD) {
        throw new Error(`Please set your CLAIM_PERIOD in a .env-${network} file`);
    }
    if (!process.env.MIN_STAKE) {
        throw new Error(`Please set your MIN_STAKE in a .env-${network} file`);
    }
    if (!process.env.MAX_STAKE) {
        throw new Error(`Please set your MAX_STAKE in a .env-${network} file`);
    }
    if (!process.env.REWARD_TOKEN) {
        throw new Error(`Please set your REWARD_TOKEN in a .env-${network} file`);
    }
    if (!process.env.STAKE_TOKEN) {
        throw new Error(`Please set your STAKE_TOKEN in a .env-${network} file`);
    }

    console.log("Deploying...");
    const WQStaking = await ethers.getContractFactory("WQStaking");
    const staking = await upgrades.deployProxy(
        WQStaking,
        [
            process.env.START_TIME,
            process.env.REWARD_TOTAL,
            process.env.DISTRIBUTION_TIME,
            process.env.STAKE_PERIOD,
            process.env.CLAIM_PERIOD,
            process.env.MIN_STAKE,
            process.env.MAX_STAKE,
            process.env.REWARD_TOKEN,
            process.env.STAKE_TOKEN
        ],
        { initializer: 'initialize' }
    );
    console.log("Proxy of Staking has been deployed to:", staking.address);

    envConfig["STAKING"] = staking.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });