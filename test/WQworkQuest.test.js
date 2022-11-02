const Web3 = require('web3')
const { expect } = require('chai')
const { ethers, web3 } = require('hardhat')
require('@nomiclabs/hardhat-waffle')
const { parseEther } = require('ethers/lib/utils')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { loadFixture } = require('ethereum-waffle')

const JobStatus = Object.freeze({
    New: 0,
    Published: 1,
    WaitWorker: 2,
    InProgress: 3,
    WaitJobVerify: 4,
    Arbitration: 5,
    Finished: 6,
})

const nullstr = '0x0000000000000000000000000000000000000000'
const job_hash = web3.utils.keccak256('JOBHASH')
const cost = parseEther('1')
const comission = parseEther('0.01')
const cost_comission = parseEther('1.01')
const reward = parseEther('0.99')
const forfeit = parseEther('0.1')
const reward_after_forfeit = parseEther('0.891')
const acces_denied_err = 'WorkQuest: Access denied or invalid status'
const WORKQUEST_FEE = '10000000000000000'
const PENSION_LOCK_TIME = '60'
const PENSION_DEFAULT_FEE = '10000000000000000'
const PENSION_FEE_PER_MONTH = '1200000000000000'
const PENSION_FEE_WITHDRAW = '5000000000000000'
const VALID_TIME = '600'
const PRICE = parseEther('228')
const SYMBOL = 'WQT'
const twentyWQT = parseEther('20');

let work_quest_owner
let employer
let worker
let arbiter
let feeReceiver
let work_quest_factory
let work_quest
let affiliat
let referral
let priceOracle
let wusd_token
let pension_fund
let oneK = parseEther('1000')

describe('Collateral auction test', function () {
    async function deployWithFixture() {
        ;[
            work_quest_owner,
            employer,
            worker,
            arbiter,
            feeReceiver,
            affiliat,
            validator,
        ] = await ethers.getSigners()

        const BridgeToken = await ethers.getContractFactory('WQBridgeToken')
        wusd_token = await upgrades.deployProxy(
            BridgeToken,
            ['WUSD stablecoin', 'WUSD', 18],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await wusd_token.deployed()
        await wusd_token.grantRole(
            await wusd_token.MINTER_ROLE(),
            work_quest_owner.address
        )
        await wusd_token.mint(employer.address, oneK)

        const PensionFund = await ethers.getContractFactory('WQPensionFund')
        pension_fund = await upgrades.deployProxy(
            PensionFund,
            [
                PENSION_LOCK_TIME,
                PENSION_DEFAULT_FEE,
                wusd_token.address,
                feeReceiver.address,
                PENSION_FEE_PER_MONTH,
                PENSION_FEE_WITHDRAW,
            ],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await pension_fund.deployed()

        const PriceOracle = await ethers.getContractFactory('WQPriceOracle')
        priceOracle = await upgrades.deployProxy(
            PriceOracle,
            [validator.address, VALID_TIME],
            { initializer: 'initialize', kind: 'transparent' }
        )
        await priceOracle.deployed()
        await priceOracle.updateToken(1, SYMBOL)
        const nonce = 1
        const message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: PRICE.toString() },
            { t: 'string', v: SYMBOL }
        )

        let signature = await web3.eth.sign(message, validator.address);
        let sig = ethers.utils.splitSignature(signature);
        await priceOracle.connect(worker).setTokenPriceUSD(nonce, PRICE, sig.v, sig.r, sig.s, SYMBOL);

        const WQReferralContract = await ethers.getContractFactory('WQReferral');
        referral = await upgrades.deployProxy(WQReferralContract, [
            priceOracle.address,
            validator.address,
            twentyWQT,
            parseEther("1000")
        ], { initializer: 'initialize', kind: 'transparent' })

        await referral.deployed();
        await referral.grantRole(await referral.SERVICE_ROLE(), validator.address);
    }

    // ==================================================================

    async function getCurrentTimestamp() {
        let block = await web3.eth.getBlock(await web3.eth.getBlockNumber())
        return block.timestamp
    }
})
