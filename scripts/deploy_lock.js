const { ethers, upgrades } = require("hardhat");
const dotenv = require('dotenv');
const fs = require('fs');
const stringify = require('dotenv-stringify');

async function main() {
    dotenv.config();
    const accounts = await ethers.getSigners();
    console.log("Sender address: ", accounts[0].address);
    const network = hre.network.name;
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) { process.env[k] = envConfig[k]; }

    const Lock = await hre.ethers.getContractFactory("WQLock");
    console.log("Deploying...");

    for (let i = 0; i < 5; i++) {
        if (!envConfig[`LOCK_BENEFECIARY_${i}`]) {
            throw new Error(`Please set your LOCK_BENEFECIARY_${i} in a .env-${network} file`);
        }
        if (!envConfig[`LOCK_EPOCH_LENGTH_${i}`]) {
            throw new Error(`Please set your LOCK_EPOCH_LENGTH_${i} in a .env-${network} file`);
        }
        if (!envConfig[`LOCK_PAYMENTS_REMAINING_${i}`]) {
            throw new Error(`Please set your LOCK_PAYMENTS_REMAINING_${i} in a .env-${network} file`);
        }
        if (!envConfig[`LOCK_START_TIME_${i}`]) {
            throw new Error(`Please set your LOCK_START_TIME_${i} in a .env-${network} file`);
        }
        if (!envConfig[`LOCK_PAYMENT_SIZE_${i}`]) {
            throw new Error(`Please set your LOCK_PAYMENT_SIZE_${i} in a .env-${network} file`);
        }
        const lock = await upgrades.deployProxy(
            Lock,
            [
                envConfig[`LOCK_BENEFECIARY_${i}`],
                envConfig[`LOCK_EPOCH_LENGTH_${i}`],
                envConfig[`LOCK_PAYMENTS_REMAINING_${i}`],
                envConfig[`LOCK_START_TIME_${i}`],
                envConfig[`LOCK_PAYMENT_SIZE_${i}`]
            ],
            { initializer: 'initialize' }
        );
        await lock.deployed();
        console.log("Lock wallet has been deployed to:", lock.address);
        envConfig[`LOCK_${i}`] = lock.address;
    }

    fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
