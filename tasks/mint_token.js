task('mint_token', 'Mint WQT tokens')
    .addParam('amount', 'Amount of tokens')
    .setAction(async function (args, hre) {
        const [owner] = await web3.eth.getAccounts()
        console.log('owner address: ', owner)

        const network = hre.network.name
        const fs = require('fs')
        const dotenv = require('dotenv')
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) {
            process.env[k] = envConfig[k]
        }

        if (!process.env.WQT_TOKEN) {
            throw new Error(`Please set your BRIDGE in a .env-${network} file`)
        }

        const wqt = await hre.ethers.getContractAt(
            'WQBridgeToken',
            process.env.WQT_TOKEN
        )
        console.log('wqt address: ', wqt)

        await wqt.mint(owner.address, args.amount)
    })
