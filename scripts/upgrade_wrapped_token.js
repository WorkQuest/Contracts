const { ethers, upgrades } = require('hardhat')
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

    // if (!process.env.WUSD_TOKEN) {
    //     throw new Error(`Please set your WUSD_TOKEN in a .env-${network} file`);
    // }
    // if (!process.env.ETH_TOKEN) {
    //     throw new Error(`Please set your ETH_TOKEN in a .env-${network} file`);
    // }
    // if (!process.env.BNB_TOKEN) {
    //     throw new Error(`Please set your BNB_TOKEN in a .env-${network} file`);
    // }
    // if (!process.env.USDT_TOKEN) {
    //     throw new Error(`Please set your USDT_TOKEN in a .env-${network} file`);
    // }
    // if (!process.env.USDC_TOKEN) {
    //     throw new Error(`Please set your USDT_TOKEN in a .env-${network} file`);
    // }

    if (!process.env.WQT_TOKEN) {
        throw new Error(`Please set your WQT_TOKEN in a .env-${network} file`)
    }
    const BridgeToken = await hre.ethers.getContractFactory('WorkQuestTokenV2')

    console.log('Upgrade tokens...')
    // let bridge_token = await upgrades.upgradeProxy(process.env.WUSD_TOKEN, BridgeToken);
    // console.log(`Upgraded ${bridge_token.address} ${await bridge_token.name()}`)

    // bridge_token = await upgrades.upgradeProxy(process.env.ETH_TOKEN, BridgeToken);
    // console.log(`Upgraded ${bridge_token.address} ${await bridge_token.name()}`)

    // bridge_token = await upgrades.upgradeProxy(process.env.BNB_TOKEN, BridgeToken);
    // console.log(`Upgraded ${bridge_token.address} ${await bridge_token.name()}`)

    // bridge_token = await upgrades.upgradeProxy(process.env.USDT_TOKEN, BridgeToken);
    // console.log(`Upgraded ${bridge_token.address} ${await bridge_token.name()}`)

    // bridge_token = await upgrades.upgradeProxy(process.env.USDC_TOKEN, BridgeToken);
    // console.log(`Upgraded ${bridge_token.address} ${await bridge_token.name()}`)

    let bridge_token = await upgrades.forceImport(
        process.env.WQT_TOKEN,
        BridgeToken
    ) //forceImport
    console.log(`Upgraded ${bridge_token.address} ${await bridge_token.name()}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
