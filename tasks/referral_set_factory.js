task('referral_set_factory', 'Set Factory').setAction(
    async function (args, hre) {
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

        const factory = await hre.ethers.getContractAt(
            'WorkQuestFactory',
            process.env.WORK_QUEST_FACTORY
        )

        const referral = await hre.ethers.getContractAt(
            'WQReferral',
            process.env.REFERRAL
        )

        const tx = await referral.setFactory(factory.address)
        await tx.wait()
        console.log((await referral.factory()).toString())
    }
)
