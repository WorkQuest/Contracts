task('bridge_redeem', 'Redeem token on bridge').setAction(async function (
    args,
    hre,
    runSuper
) {
    const accounts = await ethers.getSigners()
    const validator = accounts[0].address
    const Mwei = (value) => ethers.utils.parseUnits(value, 6)
    const amount = Mwei('1')
    console.log('Sender address: ', validator)

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

    console.log('Redeem on bridge:', process.env.BRIDGE)
    const bridge = await hre.ethers.getContractAt(
        'WQBridge',
        process.env.BRIDGE
    )
    // nonce, amount, recipient, chainFrom, chainTo, symbol
    message = await web3.utils.soliditySha3(
        { t: 'uint', v: 777 },
        { t: 'uint', v: amount },
        { t: 'address', v: '0x8e52341384f5286f4c76ce1072aba887be8e4eb9' },
        { t: 'uint256', v: 1 },
        { t: 'uint256', v: 3 },
        { t: 'string', v: 'USDT' }
    )
    let signature = await web3.eth.sign(message, validator)
    let sig = ethers.utils.splitSignature(signature)
    // nonce, chainFrom, amount, recipient, v, r, s, symbol
    console.log(
        await bridge.redeem(
            777,
            1,
            amount,
            '0x8e52341384f5286f4c76ce1072aba887be8e4eb9',
            sig.v,
            sig.r,
            sig.s,
            'USDT'
        )
    )
    console.log('Done')
})
