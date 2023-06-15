const { ethers, upgrades } = require('hardhat')
const dotenv = require('dotenv')
const fs = require('fs')

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
    if (!process.env.LIQUIDITY_MINING) {
        throw new Error(
            `Please set your LIQUIDITY_MINING in a .env-${network} file`
        )
    }

    console.log('Upgrade...')
    const WQLiquidityMining = await ethers.getContractFactory(
        'WQLiquidityMining'
    )
    const mining = await upgrades.upgradeProxy(
        process.env.LIQUIDITY_MINING,
        WQLiquidityMining
    )
    // upgradeProxy forceImport
    console.log('Token has been upgraded to:', mining.address)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
