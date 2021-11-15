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
    for (const k in envConfig) {process.env[k] = envConfig[k];}
    if (!process.env.PENSION_FUND) { throw new Error(`Plese set your PENSION_FUND in a .env-${network} file`); }

    console.log('Upgrade...');
    const PensionFund = await ethers.getContractFactory('WQPensionFund');
    const pension_fund = await upgrades.upgradeProxy(process.env.PENSION_FUND, PensionFund);
    console.log('Done!', pension_fund.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
