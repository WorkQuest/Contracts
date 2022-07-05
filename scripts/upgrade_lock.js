const { ethers, upgrades } = require('hardhat')
const hre = require('hardhat')
const dotenv = require('dotenv')
const fs = require('fs')
const stringify = require('dotenv-stringify')

async function main() {
    dotenv.config();
    const accounts = await ethers.getSigners();
    console.log('Sender address: ', accounts[0].address);
    const network = hre.network.name;
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`));
    for (const k in envConfig) { process.env[k] = envConfig[k]; }

    console.log('Upgrade...');
    const Lock = await ethers.getContractFactory('WQLock');
    for (let i = 0; i < 5; i++) {
        if (!envConfig[`LOCK_${i}`]) {
            throw new Error(`Please set your LOCK_${i} in a .env-${network} file`);
        }
        const lock = await upgrades.upgradeProxy(process.env[`LOCK_${i}`], Lock);
        console.log(`Lock wallet ${i} upgraded:`, lock.address);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
