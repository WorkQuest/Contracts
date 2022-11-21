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
const amountToSwap = toWei('2000')
const newToken = '0x1234567890AbcdEF1234567890aBcdef12345678'
const null_addr = '0x0000000000000000000000000000000000000000'
const WQT_SYMBOL = 'WQT'
const LT_SYMBOL = 'LT'
const NATIVE_SYMBOL = 'WUSD'
const null_ = ''

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

describe('Bridge test', function () {
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
        wqt_token = await upgrades.deployProxy(
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

        const BridgePool = await ethers.getContractFactory('WQBridgePool')
        bridge_pool = await upgrades.deployProxy(BridgePool, [], {
            initializer: 'initialize',
            kind: 'transparent',
        })
        await bridge_pool.deployed()

        // ========================================================================================

        const Bridge = await ethers.getContractFactory('WQBridge')
        bridge = await upgrades.deployProxy(
            Bridge,
            [chainWQ, bridge_pool.address, validator.address],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await bridge.deployed()
        await bridge.updateChain(chainETH, true)
        await bridge.updateToken(
            wqt_token.address,
            true,
            false,
            false,
            WQT_SYMBOL
        )
        await bridge.updateToken(
            lockable_token.address,
            true,
            false,
            true,
            LT_SYMBOL
        )

        await bridge_pool.grantRole(
            await bridge_pool.BRIDGE_ROLE(),
            bridge.address
        )

        const minter_role = await wqt_token.MINTER_ROLE()
        const burner_role = await wqt_token.BURNER_ROLE()
        await wqt_token.grantRole(minter_role, bridge.address)
        await wqt_token.grantRole(burner_role, bridge.address)

        // ========================================================================================

        return {
            bridge_owner,
            minter_role,
            burner_role,
            sender,
            recipient,
            validator,
            not_validator,
            wqt_token,
            lockable_token,
            bridge_pool,
        }
    }

    describe('Bridge: deploy', function () {
        it('STEP 1: Deployer address must have ADMIN_ROLE role', async function () {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            expect(
                await bridge.hasRole(
                    await bridge.ADMIN_ROLE(),
                    bridge_owner.address
                )
            ).to.equal(true)
        })
        it('STEP 2: Validator address must have VALIDATOR_ROLE role', async function () {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            expect(
                await bridge.hasRole(
                    await bridge.VALIDATOR_ROLE(),
                    validator.address
                )
            ).to.equal(true)
        })
        it("STEP 3: Not validator address shouldn't have VALIDATOR_ROLE role", async function () {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            expect(
                await bridge.hasRole(
                    await bridge.VALIDATOR_ROLE(),
                    not_validator.address
                )
            ).to.equal(false)
        })
    })

    describe('Bridge: swap', function () {
        it('swap with non existing chain id: fail', async function () {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            await expect(
                bridge
                    .connect(sender)
                    .swap(
                        nonce,
                        chainBSC,
                        AMOUNT,
                        recipient.address,
                        WQT_SYMBOL,
                        { value: 0 }
                    )
            ).to.be.revertedWith('WorkQuest Bridge: ChainTo ID is not allowed')
        })

        it('swap with non existing symbol: fail', async function () {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            await expect(
                bridge
                    .connect(sender)
                    .swap(
                        nonce,
                        chainWQ,
                        AMOUNT,
                        recipient.address,
                        NATIVE_SYMBOL,
                        { value: 0 }
                    )
            ).to.be.revertedWith('WorkQuest Bridge: ChainTo ID is not allowed')
        })

        it('swap with duplicate transaction: fail', async function () {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            await wqt_token.connect(sender).approve(bridge.address, AMOUNT)
            await bridge
                .connect(sender)
                .swap(nonce, chainETH, AMOUNT, recipient.address, WQT_SYMBOL, {
                    value: 0,
                })

            await expect(
                bridge
                    .connect(sender)
                    .swap(
                        nonce,
                        chainETH,
                        AMOUNT,
                        recipient.address,
                        WQT_SYMBOL,
                        { value: 0 }
                    )
            ).to.be.revertedWith(
                'WorkQuest Bridge: Swap is not empty state or duplicate transaction'
            )
        })

        it('swap WQT token: success', async function () {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            const valueToSwap = toWei('200')
            await lockable_token
                .connect(sender)
                .approve(bridge.address, valueToSwap)
            expect(await lockable_token.balanceOf(sender.address)).to.be.equal(
                AMOUNT
            )

            const balanceBeforeLT = await lockable_token
                .connect(sender)
                .balanceOf(sender.address)

            await bridge
                .connect(sender)
                .swap(
                    nonce,
                    chainETH,
                    valueToSwap,
                    recipient.address,
                    LT_SYMBOL,
                    {
                        value: 0,
                    }
                )
            // const message = ethers.utils.solidityKeccak256(
            //     { t: 'uint', v: nonce },
            //     { t: 'uint', v: AMOUNT },
            //     { t: 'address', v: recipient.address },
            //     { t: 'uint256', v: chainWQ },
            //     { t: 'uint256', v: chainETH },
            //     { t: 'string', v: WQT_SYMBOL }
            // )

            const message = ethers.utils.solidityKeccak256(
                [
                    'uint256',
                    'uint256',
                    'address',
                    'uint256',
                    'uint256',
                    'string',
                ],
                [
                    nonce,
                    valueToSwap,
                    recipient.address,
                    chainWQ,
                    chainETH,
                    LT_SYMBOL,
                ]
            )

            const balanceAfterLT = await await lockable_token
                .connect(sender)
                .balanceOf(sender.address)

            const data = await bridge.swaps(message)
            expect(data.nonce).to.equal(nonce)
            expect(data.state).to.equal(swapStatus.Initialized)
            expect((balanceBeforeLT - valueToSwap) / 1e18).to.eq(
                balanceAfterLT / 1e18
            )

            console.log(await ethers.provider.getBalance(bridge_pool.address))
        })

        it('fails when Symbol < 0', async function () {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            await expect(
                bridge
                    .connect(bridge_owner)
                    .updateToken(null_addr, true, true, false, null_)
            ).to.be.revertedWith(
                'WorkQuest Bridge: Symbol length must be greater than 0'
            )
        })

        it('swaps native coin with wrong amount: fail', async function () {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            await wqt_token.connect(sender).approve(bridge.address, AMOUNT)
            await bridge.updateToken(
                null_addr,
                true,
                true,
                false,
                NATIVE_SYMBOL
            )
            await expect(
                bridge
                    .connect(sender)
                    .swap(
                        nonce,
                        chainETH,
                        AMOUNT,
                        recipient.address,
                        NATIVE_SYMBOL,
                        { value: toWei('20') }
                    )
            ).to.be.revertedWith(
                'WorkQuest Bridge: Amount value is not equal to transfered funds'
            )
        })

        it('swaps native coin: success', async function () {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            const valueToSwap = toWei('200')
            await bridge.updateToken(
                null_addr,
                true,
                true,
                false,
                NATIVE_SYMBOL
            )

            const senderBalanceBefore = await ethers.provider.getBalance(
                sender.address
            )
            await bridge
                .connect(sender)
                .swap(
                    nonce,
                    chainETH,
                    valueToSwap,
                    recipient.address,
                    NATIVE_SYMBOL,
                    { value: valueToSwap }
                )
            const senderBalanceAfter = await ethers.provider.getBalance(
                sender.address
            )
            expect(
                ((senderBalanceBefore - senderBalanceAfter) / 1e18).toFixed(2)
            ).to.eq((valueToSwap / 1e18).toFixed(2))

            const message = ethers.utils.solidityKeccak256(
                [
                    'uint256',
                    'uint256',
                    'address',
                    'uint256',
                    'uint256',
                    'string',
                ],
                [
                    nonce,
                    valueToSwap,
                    recipient.address,
                    chainWQ,
                    chainETH,
                    NATIVE_SYMBOL,
                ]
            )

            const data = await bridge.swaps(message)
            expect(data.nonce).to.eq(nonce)
            expect(data.state).to.eq(swapStatus.Initialized)
            expect(await ethers.provider.getBalance(bridge_pool.address)).to.eq(
                valueToSwap
            )
        })

        it('Swap lockable token: success', async function () {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            const valueToSwap = toWei('200')
            await lockable_token
                .connect(sender)
                .approve(bridge.address, valueToSwap)
            const senderBalanceBefore = await lockable_token
                .connect(sender)
                .balanceOf(sender.address)
            await bridge
                .connect(sender)
                .swap(
                    nonce,
                    chainETH,
                    valueToSwap,
                    recipient.address,
                    LT_SYMBOL
                )
            const message = ethers.utils.solidityKeccak256(
                [
                    'uint256',
                    'uint256',
                    'address',
                    'uint256',
                    'uint256',
                    'string',
                ],
                [
                    nonce,
                    valueToSwap,
                    recipient.address,
                    chainWQ,
                    chainETH,
                    LT_SYMBOL,
                ]
            )

            const data = await bridge.swaps(message)
            expect(data.nonce).to.eq(nonce)
            expect(data.state).to.eq(swapStatus.Initialized)
            const balancePool = await lockable_token.balanceOf(
                bridge_pool.address
            )
            expect(balancePool).to.eq(valueToSwap)

            const senderBalanceAfter = await lockable_token
                .connect(sender)
                .balanceOf(sender.address)
            expect(
                ((senderBalanceBefore - senderBalanceAfter) / 1e18).toFixed(2)
            ).to.eq((valueToSwap / 1e18).toFixed(2))
        })
    })

    describe('Bridge: redeem', function () {
        it('Redeem with same chain id: fail', async function() {
            const {
                bridge_owner,
                minter_role,
                burner_role,
                sender,
                recipient,
                validator,
                not_validator,
                wqt_token,
                lockable_token,
                bridge_pool,
            } = await loadFixture(deployWithFixture)

            const amount = toWei('200')
            const message = ethers.utils.solidityKeccak256(
                [
                    'uint256',
                    'uint256',
                    'address',
                    'uint256',
                    'uint256',
                    'string',
                ],
                [
                    nonce,
                    amount,
                    recipient.address,
                    chainETH,
                    chainWQ,
                    WQT_SYMBOL
                ]
            )
            
            const signature = await web3.eth.sign(message, validator.address)
            const sig = ethers.utils.splitSignature(signature)
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
