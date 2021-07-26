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
    if (!process.env.UNLOCK_CLAIM_TIME) {
        throw new Error(`Please set your UNLOCK_CLAIM_TIME in a .env-${network} file`);
    }
    if (!process.env.WORK_QUEST_TOKEN) {
        throw new Error(`Please set your WORK_QUEST_TOKEN in a .env-${network} file`);
    }
    if (!process.env.STAKE_TOKEN) {
        throw new Error(`Please set your STAKE_TOKEN in a .env-${network} file`);
    }

    console.log("Deploying...");
    const WQStaking = await ethers.getContractFactory("WQStaking");
    const staking = await upgrades.deployProxy(
        WQStaking,
        [
            process.env.REWARD_TOTAL,
            process.env.START_TIME,
            process.env.DISTRIBUTION_TIME,
            process.env.UNLOCK_CLAIM_TIME,
            process.env.WORK_QUEST_TOKEN,
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