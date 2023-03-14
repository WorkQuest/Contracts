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
    if (!process.env.REFERRAL_REWARD) {
        throw new Error(
            `Plese set your REFERRAL_REWARD in a .env-${network} file`
        )
    }
    if (!process.env.PRICE_ORACLE) {
        throw new Error(`Plese set your PRICE_ORACLE in a .env-${network} file`)
    }
    if (!process.env.REFERRAL_SERVICE) {
        throw new Error(
            `Plese set your REFERRAL_SERVICE in a .env-${network} file`
        )
    }
    if (!process.env.REFERRAL_EARNED_THRESHOLD) {
        throw new Error(
            `Plese set your REFERRAL_EARNED_THRESHOLD in a .env-${network} file`
        )
    }

    console.log('Deploying...')
    const WQReferral = await hre.ethers.getContractFactory('WQReferral')
    const wqReferral = await upgrades.deployProxy(
        WQReferral,
        [
            process.env.PRICE_ORACLE,
            process.env.REFERRAL_SERVICE,
            process.env.REFERRAL_REWARD,
            process.env.REFERRAL_EARNED_THRESHOLD,
        ],
        { initializer: 'initialize' }
    )
    console.log('WQReferral has been deployed to:', wqReferral.address)

    envConfig['REFERRAL'] = wqReferral.address
    fs.writeFileSync(`.env-${network}`, stringify(envConfig))
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
