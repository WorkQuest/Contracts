task('check_bridge_tokens', 'Check token settings in bridge').setAction(
    async function (args, hre, runSuper) {
        require('dotenv').config()
        const accounts = await ethers.getSigners()
        const sender = accounts[0].address
        console.log('Sender address: ', sender)
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

        const bridge = await hre.ethers.getContractAt(
            'WQBridge',
            process.env.BRIDGE
        )
        let token_symbols = ['ETH', 'BNB', 'WQT', 'USDT', 'USDC']

        console.log(
            '                    token                    ',
            'enabled',
            'native',
            'lockable'
        )
        for (let i = 0; i < token_symbols.length; i++) {
            let token_info = await bridge.tokens(token_symbols[i])
            console.log(
                token_info.token,
                token_symbols[i],
                token_info.enabled,
                token_info.native,
                token_info.lockable
            )
        }
        
    }
)
