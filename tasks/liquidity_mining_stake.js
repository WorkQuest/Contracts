task('liquidity_mining_stake', 'Stake tokens to staking contracts').setAction(
    async function (args, hre, runSuper) {
        require('dotenv').config()
        const [sender] = await ethers.getSigners()
        const toWei = (value) => ethers.utils.parseUnits(value, 18)
        const AMOUNT = toWei('1000')
        console.log('Sender address: ', sender.address)
        const network = hre.network.name
        const fs = require('fs')
        const dotenv = require('dotenv')
        dotenv.config()
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) {
            process.env[k] = envConfig[k]
        }

        const liquidityMining = await ethers.getContractAt(
            'WQLiquidityMining',
            process.env.LIQUIDITY_MINING
        )

        await liquidityMining.stake(AMOUNT)
        // const stake_token = await liquidityMining.stakeToken()
        // console.log('stake_token', stake_token.toString())
        // const reward_token = await liquidityMining.rewardToken()
        // console.log('reward_token', reward_token.toString())

        // await liquidityMining.updateTps(_tps)
        // await cakeToken.allowance(sender.address, liquidityMining.address)
        // await liquidityMining.update()

        // console.log(await liquidityMining.rewardTotal())
        // await liquidityMining.updateRewardProduced(AMOUNT)
        // await liquidityMining.updateRewardTotal(rewardTotal)
        // await liquidityMining.updateTotalStaked(rewardTotal)

        // const stekeInfo = liquidityMining.getStakingInfo()
        // console.log('totalStaked', stekeInfo.totalStaked)
        // console.log('stakeTokenAddress', stekeInfo.stakeTokenAddress)
        // console.log('rewardTokenAddress', stekeInfo.rewardTokenAddress)
    }
)
