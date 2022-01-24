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

    if (!process.env.STAKING_NATIVE_REWARD_TOTAL) {
        throw new Error(`Please set your STAKING_NATIVE_REWARD_TOTAL in a .env-${network} file`);
    }
    if (!process.env.STAKING_NATIVE_START_TIME) {
        throw new Error(`Please set your STAKING_NATIVE_START_TIME in a .env-${network} file`);
    }
    if (!process.env.STAKING_NATIVE_DISTRIBUTION_TIME) {
        throw new Error(`Please set your STAKING_NATIVE_DISTRIBUTION_TIME in a .env-${network} file`);
    }
    if (!process.env.STAKING_NATIVE_STAKE_PERIOD) {
        throw new Error(`Please set your STAKING_NATIVE_STAKE_PERIOD in a .env-${network} file`);
    }
    if (!process.env.STAKING_NATIVE_CLAIM_PERIOD) {
        throw new Error(`Please set your STAKING_NATIVE_CLAIM_PERIOD in a .env-${network} file`);
    }
    if (!process.env.STAKING_NATIVE_MIN_STAKE) {
        throw new Error(`Please set your STAKING_NATIVE_MIN_STAKE in a .env-${network} file`);
    }
    if (!process.env.STAKING_NATIVE_MAX_STAKE) {
        throw new Error(`Please set your STAKING_NATIVE_MAX_STAKE in a .env-${network} file`);
    }

    console.log("Deploying...");
    const WQStaking = await ethers.getContractFactory("WQStakingNative");
    const staking = await upgrades.deployProxy(
        WQStaking,
        [
            process.env.STAKING_NATIVE_START_TIME,
            process.env.STAKING_NATIVE_REWARD_TOTAL,
            process.env.STAKING_NATIVE_DISTRIBUTION_TIME,
            process.env.STAKING_NATIVE_STAKE_PERIOD,
            process.env.STAKING_NATIVE_CLAIM_PERIOD,
            process.env.STAKING_NATIVE_MIN_STAKE,
            process.env.STAKING_NATIVE_MAX_STAKE
        ],
        { initializer: 'initialize', kind: 'uups' }
    );
    console.log("Proxy of StakingNative has been deployed to:", staking.address);

    envConfig["STAKING_NATIVE"] = staking.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });