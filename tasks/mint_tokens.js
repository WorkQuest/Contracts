task('mint_tokens', 'Mint tokens to the owner').setAction(async function (
    args,
    hre
) {
    require('dotenv').config()
    const toWei = (value) => ethers.utils.parseUnits(value, 18)
    const Mwei = (value) => ethers.utils.parseUnits(value, 6)
    const [owner] = await web3.eth.getAccounts()
    // const AMOUNT = Mwei('1000000000000')
    const AMOUNT = toWei('100000000')

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
        'WorkQuestToken',
        process.env.BNB_TOKEN
    )

    const mintTx = await bridge_token.mint(
        '0x9206FCDbA921162c16de4Df9732d3adD256F23e3',
        AMOUNT
    )
    await mintTx.wait()
    console.log(
        (
            await bridge_token.balanceOf(
                '0x9206FCDbA921162c16de4Df9732d3adD256F23e3'
            )
        ).toString()
    )
})
