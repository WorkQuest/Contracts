task('token_settings_on_bridge', 'Check token settings on bridge')
    .addParam('symbol', 'Token symbol')
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config()
        const acc = await ethers.getSigners()
        console.log('Sender address: ', acc[0].address)
        const network = hre.network.name
        const fs = require('fs')
        const dotenv = require('dotenv')
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) {
            process.env[k] = envConfig[k]
        }

        if (!process.env.BRIDGE) {
            throw new Error(`Please set your BRIDGE in a .env-${network} file`)
        }

        console.log('Try to add chain to bridge:', args.symbol)
        const bridge = await hre.ethers.getContractAt(
            'WQBridge',
            process.env.BRIDGE
        )
        const tx = await bridge.chains(args.symbol)
        console.log('tx: ', tx)
    })
