// const axios = require('axios')

// const wqtContractAddress = '0xe89508D74579A06A65B907c91F697CF4F8D9Fac7'
// const hackBlockNumber = 27457195
// const exchange1StopBlockNumber = 27464657

// const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${wqtContractAddress}&startblock=${hackBlockNumber}&endblock=${exchange1StopBlockNumber}&sort=asc&apikey=64Y3KE1RP5X4NJQVSEY2GHKECRZRQXSRBY`

// axios
//     .get(apiUrl)
//     .then((response) => {
//         const transactions = response.data.result
//         const balances = {}
//         transactions.forEach((transaction) => {
//             const from = transaction.from.toLowerCase()
//             const to = transaction.to.toLowerCase()
//             const value = parseFloat(transaction.value) / 1e18
//             balances[from] = (balances[from] || 0) - value
//             balances[to] = (balances[to] || 0) + value
//         })
//         console.log(balances)
//     })
//     .catch((error) => {
//         console.log(error)
//     })

const contractABI = [
    {
        inputs: [
            { internalType: 'address', name: '_logic', type: 'address' },
            { internalType: 'address', name: 'admin_', type: 'address' },
            { internalType: 'bytes', name: '_data', type: 'bytes' },
        ],
        stateMutability: 'payable',
        type: 'constructor',
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: false,
                internalType: 'address',
                name: 'previousAdmin',
                type: 'address',
            },
            {
                indexed: false,
                internalType: 'address',
                name: 'newAdmin',
                type: 'address',
            },
        ],
        name: 'AdminChanged',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: 'address',
                name: 'beacon',
                type: 'address',
            },
        ],
        name: 'BeaconUpgraded',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: 'address',
                name: 'implementation',
                type: 'address',
            },
        ],
        name: 'Upgraded',
        type: 'event',
    },
    { stateMutability: 'payable', type: 'fallback' },
    {
        inputs: [],
        name: 'admin',
        outputs: [{ internalType: 'address', name: 'admin_', type: 'address' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { internalType: 'address', name: 'newAdmin', type: 'address' },
        ],
        name: 'changeAdmin',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [],
        name: 'implementation',
        outputs: [
            {
                internalType: 'address',
                name: 'implementation_',
                type: 'address',
            },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            {
                internalType: 'address',
                name: 'newImplementation',
                type: 'address',
            },
        ],
        name: 'upgradeTo',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            {
                internalType: 'address',
                name: 'newImplementation',
                type: 'address',
            },
            { internalType: 'bytes', name: 'data', type: 'bytes' },
        ],
        name: 'upgradeToAndCall',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
    },
    { stateMutability: 'payable', type: 'receive' },
]

const Web3 = require('web3')
const web3 = new Web3('https://bsc-dataseed1.binance.org:443')
const contractAddress = '0xe89508D74579A06A65B907c91F697CF4F8D9Fac7'

async function getBalancesAtBlock() {
    const contract = new web3.eth.Contract(contractABI, contractAddress)
    const blockNumber = 27464657
    const holders = await contract.holders().call({}, blockNumber)
    const balances = []
    for (let i = 0; i < holders.length; i++) {
        const balance = await contract.methods
            .balanceOf(holders[i])
            .call({}, blockNumber)
        if (balance > 0) {
            balances.push({ address: holders[i], balance: balance })
        }
    }
    return balances
}

getBalancesAtBlock()
    .then((balances) => {
        console.log(balances)
    })
    .catch((error) => {
        console.error(error)
    })
