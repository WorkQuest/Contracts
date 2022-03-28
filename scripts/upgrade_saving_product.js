const { ethers, upgrades } = require('hardhat')
const hre = require('hardhat')
const dotenv = require('dotenv')
const fs = require('fs')

async function main() {
    dotenv.config()
    const accounts = await ethers.getSigners()
    const sender = accounts[0].address
    console.log('Sender address: ', sender)

    const network = hre.network.name
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) { process.env[k] = envConfig[k]; }
    if (!process.env.SAVING_PRODUCT) { throw new Error(`Plese set your SAVING_PRODUCT in a .env-${network} file`); }

    console.log('Upgrade...');
    const Saving = await ethers.getContractFactory('WQSavingProduct');
    const saving = await upgrades.upgradeProxy(process.env.SAVING_PRODUCT, Saving);
    console.log('Done!', saving.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
