require("@nomiclabs/hardhat-waffle");
require('dotenv').config();

module.exports = {
  defaultNetwork: "development",
  networks: {
    development: {
      url: "http://127.0.0.1:8545"
    },
    test: {
      url: "http://127.0.0.1:8545",
      accounts: [process.env.SECRET_KEY]
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


