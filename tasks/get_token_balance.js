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

    const wqt = await hre.ethers.getContractAt(
        'WorkQuestToken',
        '0xe89508d74579a06a65b907c91f697cf4f8d9fac7' // 0xe89508d74579a06a65b907c91f697cf4f8d9fac7 OLD WQT
    )
    
    // await wqt.pause()
    // console.log('tx: ', await wqt.paused())

    const tx = await wqt.addBlockList(
        '0x3ea2de549ae9dcb7992f91227e8d6629a22c3b40'
    )
    // await wqt.addBlockList('0xb7cfc0ea9425ea703b9fdc72a6edd4b25c18fad3')
    // await wqt.addBlockList('0x55f92097553c09e1c29811d27b929b8a4f3e3257')
    // await wqt.addBlockList('0xd2c5fb3b87a47b874151d8fcc0a567dab6b01416')
    // await wqt.addBlockList('0x4de0ed1769ecfecd2bfe949df85f5dc113d2eaa4')
    // await wqt.addBlockList('0xb0af39e546ae1c7aa065b0decdc58d9ba3ebb579')
    // await wqt.addBlockList('0xddda4110a0c24cc3ea638f44d6baf378a83530f3')


    // const usdt = await ethers.getContractAt(
    //     'IERC20Upgradeable',
    //     process.env.USDT_TOKEN
    // )

    // const usdtDecimals = await usdt.decimals()
    // console.log('usdtDecimals is: ', usdtDecimals.toString())

    // const balanceUSDT = await hre.bridgePool.balanceOf(usdt.address)
    // console.log('USDT balance is: ', balanceUSDT.toString())
})
