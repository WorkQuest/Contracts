const { ethers, upgrades } = require('hardhat')
const hre = require('hardhat')
const dotenv = require('dotenv')
const fs = require('fs')
const stringify = require('dotenv-stringify')

async function main() {
    dotenv.config()
    const accounts = await ethers.getSigners()
    const sender = accounts[0].address
    console.log('Sender address: ', sender)
    const network = hre.network.name
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) { process.env[k] = envConfig[k]; }

    if (!process.env.PROMOTION) { throw new Error(`Plese set your PROMOTION in a .env-${network} file`); }

    console.log('Upgrade...');
    const Promotion = await ethers.getContractFactory('WQPromotion');
    const promotion = await upgrades.upgradeProxy(process.env.PROMOTION, Promotion);
    console.log('Done!', promotion.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
