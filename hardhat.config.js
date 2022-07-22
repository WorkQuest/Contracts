require("@nomiclabs/hardhat-waffle");
require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-web3')
// require('solidity-coverage')
require('hardhat-docgen')
require("@nomiclabs/hardhat-etherscan")
require('@openzeppelin/hardhat-upgrades')
require('./tasks');

require('dotenv').config();
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 60 });


const chainIds = {
  ganache: 1337,
  goerli: 5,
  hardhat: 31337,
  kovan: 42,
  mainnet: 1,
  rinkeby: 4,
  ropsten: 3,
};

let mnemonic;
if (!process.env.MNEMONIC) {
  throw new Error('Please set your MNEMONIC in a .env file');
} else {
  mnemonic = process.env.MNEMONIC;
}

let providerApiKey;
if (!process.env.PROVIDER_API_KEY) {
  throw new Error('Please set your PROVIDER_API_KEY in a .env file');
} else {
  providerApiKey = process.env.PROVIDER_API_KEY;
}

let explorerApiKey;
if (!process.env.EXPLORER_API_KEY) {
  throw new Error('Please set your EXPLORER_API_KEY in a .env file');
} else {
  explorerApiKey = process.env.EXPLORER_API_KEY;
}


function createNetworkConfig(network) {
  const url = `https://${network}.infura.io/v3/${providerApiKey}`;
  // const url = `https://speedy-nodes-nyc.moralis.io/${providerApiKey}/eth/${network}`;
  return {
    accounts: { mnemonic: mnemonic },
    chainId: chainIds[network],
    gas: "auto",
    gasPrice: 35000000000,
    url: url
  };
}

module.exports = {
  defaultNetwork: "dev",
  networks: {
    hardhat: {
      mining: {
        auto: true,
        // interval: 5000
      }
    },
    dev: {
      url: "http://127.0.0.1:8545/"
    },
    wqdevnet: {
      url: "https://dev-node-ams3.workquest.co/",
      accounts: { mnemonic: mnemonic },
      chainId: 20220112
    },
    wqtestnet: {
      url: "https://testnet-gate.workquest.co/",
      accounts: { mnemonic: mnemonic },
      chainId: 1991
    },
    wqmainnet: {
      url: "https://mainnet-gate.workquest.co/",
      accounts: { mnemonic: mnemonic },
      chainId: 2009
    },
    bsctestnet: {
      url: `https://data-seed-prebsc-1-s1.binance.org:8545/`,
      chainId: 97,
      gas: "auto",
      gasPrice: 5000000000,
      accounts: { mnemonic: mnemonic }
    },
    bscmainnet: {
      url: `https://bsc-dataseed1.binance.org/`,
      chainId: 56,
      gas: "auto",
      gasPrice: 5000000000,
      accounts: { mnemonic: mnemonic }
    },
    mumbai: {
      url: `https://rpc-mumbai.matic.today/`,
      chainId: 80001,
      gas: "auto",
      gasPrice: 5000000000,
      accounts: { mnemonic: mnemonic }
    },
    polygon: {
      url: `https://polygon-rpc.com/`,
      chainId: 137,
      gas: "auto",
      gasPrice: 60000000000,
      accounts: { mnemonic: mnemonic }
    },
    mainnet: createNetworkConfig('mainnet'),
    rinkeby: createNetworkConfig('rinkeby'),
    ropsten: createNetworkConfig('ropsten')
  },
  paths: {
    artifacts: './artifacts',
    cache: './cache',
    sources: './contracts',
    tests: './test',
  },
  solidity: {
    compilers: [
      {
        version: "0.8.2",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
    ]
  },
  etherscan: {
    apiKey: explorerApiKey
  },
  mocha: {
    timeout: 20000
  },
  docgen: {
    path: './doc',
    clear: true,
    runOnCompile: false,
  }
}


