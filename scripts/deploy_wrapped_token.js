const { ethers, upgrades } = require('hardhat')
const dotenv = require('dotenv')
const fs = require('fs')
const stringify = require('dotenv-stringify')

async function main() {
    dotenv.config()
    const [owner] = await web3.eth.getAccounts();
    console.log('my account address is: ', owner);
    const AMOUNT = hre.ethers.utils.parseEther("1000000")

    const network = hre.network.name
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) {
        process.env[k] = envConfig[k]
    }
    if (!process.env.BRIDGE_TOKEN_NAME) {
        throw new Error(
            `Please set your BRIDGE_TOKEN_NAME in a .env-${network} file`
        )
    }
    if (!process.env.BRIDGE_TOKEN_SYMBOL) {
        throw new Error(
            `Please set your BRIDGE_TOKEN_SYMBOL in a .env-${network} file`
        )
    }
    if (!process.env.BRIDGE_TOKEN_DECIMALS) {
        throw new Error(
            `Please set your BRIDGE_TOKEN_DECIMALS in a .env-${network} file`
        )
    }

    const BridgeToken = await hre.ethers.getContractFactory('WQBridgeToken')

    console.log('Deploying...')
    const bridge_token = await upgrades.deployProxy(
        BridgeToken,
        [
            process.env.BRIDGE_TOKEN_NAME,
            process.env.BRIDGE_TOKEN_SYMBOL,
            process.env.BRIDGE_TOKEN_DECIMALS,
        ],
        {
            initializer: 'initialize',
            gasPrice: '100',
            gasLimit: '50000000',
            kind: 'uups',
        }
    )
    await bridge_token.deployed()
    console.log(
        `${process.env.BRIDGE_TOKEN_NAME} has been deployed to:`,
        bridge_token.address
    )

    envConfig[`${process.env.BRIDGE_TOKEN_SYMBOL}_TOKEN`] = bridge_token.address
    fs.writeFileSync( `.env-${network}`, stringify( envConfig ) )

    const minter_role = await bridge_token.MINTER_ROLE()
    const tx = await bridge_token.grantRole( minter_role, owner )
    await tx.wait()
    await bridge_token.mint(owner, AMOUNT)
    console.log(await bridge_token.balanceOf(owner))
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
