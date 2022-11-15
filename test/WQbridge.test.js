const Web3 = require('web3')
const { expect } = require('chai')
const { ethers, web3 } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')
const {
    time,
    loadFixture,
} = require('@nomicfoundation/hardhat-network-helpers')

const BigNumber = require('bignumber.js')

const toWei = (value) => ethers.utils.parseUnits(value, 18)
const toBN = (num) => {
    if (typeof num == 'string') return new BigNumber(num)
    return new BigNumber(num.toString())
}

const nonce = 1
const chainWQ = 1
const chainETH = 2
const chainBSC = 3
const AMOUNT = toWei('500000000000')
const newToken = '0x1234567890AbcdEF1234567890aBcdef12345678'
const null_addr = '0x0000000000000000000000000000000000000000'
const WQT_SYMBOL = 'WQT'
const LT_SYMBOL = 'LT'
const native_coin = 'WUSD'

const swapStatus = Object.freeze({
    Empty: 0,
    Initialized: 1,
    Redeemed: 2,
})

let bridge_owner
let validator
let not_validator
let sender
let recipient
let bridge
let tokenWeth
let lockable_token
let bridge_pool

describe('Borrowing test', function () {
    async function deployWithFixture() {
        ;[bridge_owner, sender, recipient, validator, not_validator] =
            await ethers.getSigners()

        const BridgeToken = await ethers.getContractFactory('WQBridgeToken')
        lockable_token = await upgrades.deployProxy(
            BridgeToken,
            ['LT Token', LT_SYMBOL, 18],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await lockable_token.deployed()
        await lockable_token.grantRole(
            await lockable_token.MINTER_ROLE(),
            bridge_owner.address
        )
        await lockable_token.mint(sender.address, AMOUNT)

        // ========================================================================================

        const BridgeToken2 = await ethers.getContractFactory('WQBridgeToken')
        lockable_token = await upgrades.deployProxy(
            BridgeToken2,
            ['WQT Token', WQT_SYMBOL, 18],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await wqt_token.deployed()
        await wqt_token.grantRole(
            await wqt_token.MINTER_ROLE(),
            bridge_owner.address
        )
        await wqt_token.mint(sender.address, AMOUNT)

        // ========================================================================================

        const BridgePool = await ethers.getContractFactory("WQBridgePool");
        bridge_pool = await upgrades.deployProxy(BridgePool, [], { initializer: 'initialize', kind: 'transparent' });
        await bridge_pool.deployed();
        

        // ========================================================================================

        const Bridge = await ethers.getContractFactory("WQBridge");
        bridge = await upgrades.deployProxy(Bridge, [chainWQ, bridge_pool.address, validator.address], { initializer: 'initialize', kind: 'transparent' });
        await bridge.deployed();

        // ========================================================================================

        return {
            bridge_owner,
            sender,
            recipient,
            validator,
            not_validator,
            tokenWeth,
            lockable_token,
            bridge_pool
        }
    }

    describe('Borrowing: deploy', function () {
        it('Should be set all variables and roles', async function () {
            const {
                bridge_owner,
                sender,
                recipient,
                validator,
                not_validator,
                tokenWeth,
                lockable_token,
                bridge_pool
            } = await loadFixture(deployWithFixture)
        })
    })

    async function oracleSetPrice(price, symbol) {
        nonce += 1
        let message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: [price.toString()] },
            { t: 'uint256', v: [parseEther('2').toString()] },
            { t: 'string', v: [symbol] }
        )
        let signature = await web3.eth.sign(message, service.address)

        let sig = ethers.utils.splitSignature(signature)
        let current_timestamp = (
            await web3.eth.getBlock(await web3.eth.getBlockNumber())
        ).timestamp

        ethers.provider.send('evm_setNextBlockTimestamp', [
            current_timestamp + VALID_TIME,
        ])
        await priceOracle.setTokenPricesUSD(
            nonce,
            sig.v,
            sig.r,
            sig.s,
            [price],
            [parseEther('2').toString()],
            [symbol]
        )
        await hre.ethers.provider.send('evm_mine', [])
    }

    async function getCurrentTimestamp() {
        let block = await web3.eth.getBlock(await web3.eth.getBlockNumber())
        return block.timestamp
    }

    async function getTimestamp() {
        let blockNumber = await ethers.provider.send('eth_blockNumber', [])
        let txBlockNumber = await ethers.provider.send('eth_getBlockByNumber', [
            blockNumber,
            false,
        ])
        return parseInt(new BigNumber(txBlockNumber.timestamp).toString())
    }
})
