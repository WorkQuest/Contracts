const { task } = require('hardhat/config')

task('get_token_balance', 'Get token balance').setAction(async function (
    args,
    hre
) {
    require('dotenv').config()
    const [owner] = await web3.eth.getAccounts()
    console.log('my account address is: ', owner)
    const network = hre.network.name
    const fs = require('fs')
    const dotenv = require('dotenv')
    dotenv.config()
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }

    const usdt = await hre.ethers.getContractAt(
        'WQBridgeToken',
        process.env.USDT_TOKEN
    )

    // const usdt = await ethers.getContractAt(
    //     'IERC20Upgradeable',
    //     process.env.USDT_TOKEN
    // )

    const usdtDecimals = await usdt.decimals()
    console.log('usdtDecimals is: ', usdtDecimals.toString())

    // const balanceUSDT = await hre.bridgePool.balanceOf(usdt.address)
    // console.log('USDT balance is: ', balanceUSDT.toString())
})
