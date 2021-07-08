
require("@nomiclabs/hardhat-waffle");
require('./tasks');
require('dotenv').config();
require('hardhat-docgen');

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    development: {
      url: "http://127.0.0.1:8545/"
    },
    testnet: {
      url: "https://dev-node-ams3.workquest.co/",
      accounts: {mnemonic: process.env.MNEMONIC},
      gasPrice: 10000000000
    }
  },
  solidity: {
    version: "0.8.6",
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


