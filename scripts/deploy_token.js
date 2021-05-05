const hre = require("hardhat");
//const Web3 = require("web3");
const { parseEther } = require("ethers/utils");
const fs = require('fs');

const privkey = fs.readFileSync(".secret").toString().trim();
//var web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'));


async function main() {
  require('dotenv').config();
  let token_owner;
  [token_owner] = await hre.ethers.getSigners();
  const WUSDToken = await hre.ethers.getContractFactory("WUSDToken", token_owner);
  const wusd_token = await WUSDToken.deploy(parseEther(process.env.TOKEN_TOTAL_SUPPLY));
  console.log("Token address:", wusd_token.address);

  /*
  var artifacts = await hre.artifacts.readArtifact("WUSDToken");
  const WUSDToken = new web3.eth.Contract(artifacts.abi);

  WUSDToken
    .deploy({ data: artifacts.bytecode, arguments: [parseEther(process.env.TOKEN_TOTAL_SUPPLY)]})
    .send({
      from: '0x210608BED57cc91c0cbE85F9bA4c77d327d3b771',
      gas: 4700000,
      gasPrice: '20000000000000'
    },
      (error, tx_hash) => {
        console.log(error, tx_hash);
      }
    ).then((contract) => {
      console.log(contract);
    });

  var tx = {
    from: '0x210608BED57cc91c0cbE85F9bA4c77d327d3b771',
    gasPrice: "20000000000",
    gas: "4900000",
    data: artifacts.bytecode
  };

  web3.eth.accounts.signTransaction(tx, privkey)
  .then( signedTx => {
    web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .then(console.log);
  });
  */
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
