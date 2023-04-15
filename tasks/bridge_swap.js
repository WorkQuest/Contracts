task('bridge_swap', 'Swap token on bridge').setAction(async function (
    args,
    hre,
    runSuper
) {
    const accounts = await ethers.getSigners()
    const sender = accounts[0].address
    console.log('Sender address: ', sender)
    const Mwei = (value) => ethers.utils.parseUnits(value, 6)
    const amount = Mwei('1')

    const network = hre.network.name
    const fs = require('fs')
    const dotenv = require('dotenv')
    dotenv.config()
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }
    if (!process.env.BRIDGE) {
        throw new Error(`Please set your BRIDGE in a .env-${network} file`)
    }
    if (!process.env.USDT_TOKEN) {
        throw new Error('Please set your USDT_TOKEN in a .env file')
    }

    console.log('Swap on bridge:', process.env.BRIDGE)
    const bridge = await hre.ethers.getContractAt(
        'WQBridge',
        process.env.BRIDGE
    )

    const token = await bridge.tokens( "USDT" )
    console.log(token)

    // const usdt = await hre.ethers.getContractAt(
    //     'WQBridgeToken',
    //     process.env.USDT_TOKEN
    // )
    // await usdt.approve(bridge.address, amount)
    // // nonce, chainTo, amount, recipient, symbol
    // await bridge.swap(
    //     777,
    //     3,
    //     amount,
    //     '0x8e52341384f5286f4c76ce1072aba887be8e4eb9',
    //     'USDT'
    // )
    // console.log("Done");
    // const pool = await hre.ethers.getContractAt(
    //     'WQBridgePool',
    //     process.env.BRIDGE_POOL
    // )
    // const usdt = await hre.ethers.getContractAt(
    //     'WQBridgeToken',
    //     process.env.USDT_TOKEN // 5000000000000000000
    // )

    // console.log(await bridge.pool())
})
