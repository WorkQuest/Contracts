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
    for (const k in envConfig) {process.env[k] = envConfig[k]}

    if (!process.env.STAKING_REWARD_TOTAL) {
        throw new Error(`Please set your REWARD_TOTAL in a .env-${network} file`);
    }
    if (!process.env.STAKING_START_TIME) {
        throw new Error(`Please set your START_TIME in a .env-${network} file`);
    }
    if (!process.env.STAKING_DISTRIBUTION_TIME) {
        throw new Error(`Please set your DISTRIBUTION_TIME in a .env-${network} file`);
    }
    if (!process.env.STAKING_STAKE_PERIOD) {
        throw new Error(`Please set your STAKE_PERIOD in a .env-${network} file`);
    }
    if (!process.env.STAKING_CLAIM_PERIOD) {
        throw new Error(`Please set your CLAIM_PERIOD in a .env-${network} file`);
    }
    if (!process.env.STAKING_MIN_STAKE) {
        throw new Error(`Please set your MIN_STAKE in a .env-${network} file`);
    }
    if (!process.env.STAKING_MAX_STAKE) {
        throw new Error(`Please set your MAX_STAKE in a .env-${network} file`);
    }
    if (!process.env.WQT_TOKEN) {
        throw new Error(`Please set your WQT_TOKEN in a .env-${network} file`);
    }

    console.log("Deploying...");
    const WQStaking = await ethers.getContractFactory("WQStaking");
    const staking = await upgrades.deployProxy(
        WQStaking,
        [process.env.START_TIME,
         process.env.REWARD_TOTAL,
         process.env.DISTRIBUTION_TIME,
         process.env.STAKE_PERIOD,
         process.env.CLAIM_PERIOD,
         process.env.MIN_STAKE,
         process.env.MAX_STAKE,
         process.env.WQT_TOKEN,
         process.env.WQT_TOKEN],
        { initializer: 'initialize', kind: 'uups' }
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