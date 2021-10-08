const { hre, ethers, upgrades } = require('hardhat')
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
    if (!process.env.WQ_REFERRAL) {
        throw new Error(`Plese set your WQ_REFERRAL in a .env-${network} file`)
    }

    console.log('Upgrade...')
    const WQReferral = await hre.ethers.getContractFactory('WQReferral')
    const wqReferral = await upgrades.upgradeProxy(
        process.env.WQ_REFERRAL,
        WQReferral
    )
    console.log('WQReferral has been upgraded at:', wqReferral.address)

    envConfig['WQ_REFERRAL'] = wqReferral.address
    fs.writeFileSync(`.env-${network}`, stringify(envConfig))
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
