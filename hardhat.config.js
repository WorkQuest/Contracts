require('@openzeppelin/hardhat-upgrades');
require("@nomiclabs/hardhat-waffle");
require('./tasks');
require('hardhat-docgen');
require('dotenv').config();

require('@nomiclabs/hardhat-etherscan')
require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-web3')
// import '@typechain/hardhat'
require('solidity-coverage')
require('hardhat-docgen')
require('@openzeppelin/hardhat-upgrades')
require("@nomiclabs/hardhat-etherscan")


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

let infuraApiKey;
if (!process.env.INFURA_API_KEY) {
  throw new Error('Please set your INFURA_API_KEY in a .env file');
} else {
  infuraApiKey = process.env.INFURA_API_KEY;
}

function createNetworkConfig(network) {
  const url = `https://${network}.infura.io/v3/${infuraApiKey}`;
  return {
    accounts: { mnemonic: mnemonic },
    chainId: chainIds[network],
    gas: "auto",
    gasPrice: 50000000000,
    url: url
  };
}

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    development: {
      url: "http://127.0.0.1:8545/"
    },
    wqdevnet: {
      url: "https://dev-node-ams3.workquest.co/",
      accounts: { mnemonic: mnemonic },
      gasPrice: 10000000000,
      chainId: 20210811
    },
    bsctestnet: {
      url: "https://data-seed-prebsc-2-s1.binance.org:8545",
      chainId: 97,
      gasPrice: 20000000000,
      accounts: { mnemonic: mnemonic }
    },
    bscmainnet: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      gasPrice: 20000000000,
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
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  mocha: {
    timeout: 20000
  },
  docgen: {
    path: './doc',
    clear: true,
    runOnCompile: true,
  }
}


