task( 'mint_tokens', 'Mint tokens to the owner' )
    .setAction( async function (args, hre) {  
    require('dotenv').config()
    const [owner] = await web3.eth.getAccounts()
    const AMOUNT = ethers.utils.parseEther('1000000')
    console.log('my account address is: ', owner)
    const network = hre.network.name
    const fs = require('fs')
    const dotenv = require('dotenv')
    dotenv.config()
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }

    const bridge_token = await hre.ethers.getContractAt(
        'WQBridgeToken',
        process.env.WQT_TOKEN
    )

    const mintTx = await bridge_token.mint(owner, AMOUNT)
    await mintTx.wait()
    console.log((await bridge_token.balanceOf(owner)).toString())
})
