
require("@nomiclabs/hardhat-waffle");
require('./tasks');
require('dotenv').config();
require('hardhat-docgen');

let mnemonic;
if (!process.env.MNEMONIC) {
  throw new Error('Please set your MNEMONIC in a .env file');
} else {
  mnemonic = process.env.MNEMONIC;
}

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    development: {
      url: "http://127.0.0.1:8545/"
    },
    testnet: {
      url: "https://dev-node-ams3.workquest.co/",
      accounts: { mnemonic: mnemonic },
      gasPrice: 10000000000
    }
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


