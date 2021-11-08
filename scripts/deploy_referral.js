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

    const network = hre.network.name;
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }
    if (!process.env.REFERRAL_REWARD) {
        throw new Error(
            `Plese set your REFERRAL_REWARD in a .env-${network} file`
        )
    }
    if (!process.env.WQT_TOKEN) {
        throw new Error(`Plese set your WQT_TOKEN in a .env-${network} file`)
    }
    // TODO when WQOracle is finished add throw smth
    if (!process.env.PRICE_ORACLE) {
        throw new Error(`Plese set your PRICE_ORACLE in a .env-${network} file`)
    }
    if (!process.env.REFERRAL_SERVICE) {
        throw new Error(`Plese set your REFERRAL_SERVICE in a .env-${network} file`)
    }
    if (!process.env.WORK_QUEST_FACTORY) {
        throw new Error(`Plese set your WORK_QUEST_FACTORY in a .env-${network} file`)
    }

    console.log('Deploying...')
    const WQReferral = await hre.ethers.getContractFactory('WQReferral')
    const wqReferral = await upgrades.deployProxy(
        WQReferral,
        [
            process.env.WQT_TOKEN,
            process.env.WQ_ORACLE,
            process.env.REFERRAL_SERVICE,
            process.env.WQ_REFERRAL_REWARD,
        ],
        { initializer: 'initialize' }
    );
    console.log('WQReferral has been deployed to:', wqReferral.address)

    envConfig['REFERRAL'] = wqReferral.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig))
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
