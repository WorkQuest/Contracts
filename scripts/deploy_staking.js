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
    for (const k in envConfig) { process.env[k] = envConfig[k] }

    if (!process.env.STAKING_REWARD_TOTAL) {
        throw new Error(`Please set your STAKING_REWARD_TOTAL in a .env-${network} file`);
    }
    if (!process.env.STAKING_START_TIME) {
        throw new Error(`Please set your STAKING_START_TIME in a .env-${network} file`);
    }
    if (!process.env.STAKING_DISTRIBUTION_TIME) {
        throw new Error(`Please set your STAKING_DISTRIBUTION_TIME in a .env-${network} file`);
    }
    if (!process.env.STAKING_STAKE_PERIOD) {
        throw new Error(`Please set your STAKING_STAKE_PERIOD in a .env-${network} file`);
    }
    if (!process.env.STAKING_CLAIM_PERIOD) {
        throw new Error(`Please set your STAKING_CLAIM_PERIOD in a .env-${network} file`);
    }
    if (!process.env.STAKING_MIN_STAKE) {
        throw new Error(`Please set your STAKING_MIN_STAKE in a .env-${network} file`);
    }
    if (!process.env.STAKING_MAX_STAKE) {
        throw new Error(`Please set your STAKING_MAX_STAKE in a .env-${network} file`);
    }
    if (!process.env.WUSD_TOKEN) {
        throw new Error(`Please set your WUSD_TOKEN in a .env-${network} file`);
    }

    console.log("Deploying...");
    const WQStaking = await ethers.getContractFactory("WQStakingWUSD");
    const staking = await upgrades.deployProxy(
        WQStaking,
        [process.env.STAKING_START_TIME,
        process.env.STAKING_REWARD_TOTAL,
        process.env.STAKING_DISTRIBUTION_TIME,
        process.env.STAKING_STAKE_PERIOD,
        process.env.STAKING_CLAIM_PERIOD,
        process.env.STAKING_MIN_STAKE,
        process.env.STAKING_MAX_STAKE,
        process.env.WUSD_TOKEN
        ],
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