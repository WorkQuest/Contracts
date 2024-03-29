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
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }
    if (!process.env.REFERRAL) {
        throw new Error(`Plese set your REFERRAL in a .env-${network} file`)
    }

    console.log('Upgrade...')
    const WQReferral = await hre.ethers.getContractFactory('WQReferral')
    const wqReferral = await upgrades.upgradeProxy(process.env.REFERRAL, WQReferral,  { kind: 'uups' });
    console.log('WQReferral has been upgraded at:', wqReferral.address)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
