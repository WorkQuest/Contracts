
require("@nomiclabs/hardhat-waffle");
require('./tasks');
require('dotenv').config();

module.exports = {
  defaultNetwork: "development",
  networks: {
    development: {
      url: "http://127.0.0.1:8545"
    },
    testnet: {
      url: "https://dev-node-ams3.workquest.co/",
      accounts: [process.env.SECRET_KEY],
      gasPrice: 10000000000
    }
  },
  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  mocha: {
    timeout: 20000
  }
}


