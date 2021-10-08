const { hre, ethers, upgrades } = require('hardhat')
const dotenv = require('dotenv')
const fs = require('fs')
const stringify = require('dotenv-stringify')

async function main() {
    dotenv.config()
    const accounts = await ethers.getSigners()
    const sender = accounts[0].address
    console.log('Sender address: ', sender)

    const network = hre.network.name
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }
    if (!process.env.WORK_QUEST_FACTORY) {
        throw new Error(
            `Please set your WORK_QUEST_FACTORY in a .env-${network} file`
        )
    }

    console.log('Deploying...')
    const WorkQuestFactory = await hre.ethers.getContractFactory(
        'WorkQuestFactory'
    )
    const work_quest_factory = await upgrades.upgradeProxy(
        process.env.WORK_QUEST_FACTORY,
        WorkQuestFactory
    )
    console.log(
        'WorkQuestFactory has been upgraded at:',
        work_quest_factory.address
    )

    envConfig['WORK_QUEST_FACTORY'] = work_quest_factory.address
    fs.writeFileSync(`.env-${network}`, stringify(envConfig))
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
