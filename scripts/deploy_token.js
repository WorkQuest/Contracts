const hre = require("hardhat");
const { parseEther } = require("ethers/utils");
const fs = require('fs');

async function main() {
  require('dotenv').config();
  const accounts = await ethers.getSigners();
  const sender = accounts[0].address;
  console.log("Sender address: ", sender);
  console.log("Deploying...");
  const WQToken = await hre.ethers.getContractFactory("WQToken");
  const wqt_token = await WQToken.deploy(parseEther(process.env.TOKEN_TOTAL_SUPPLY), { gasLimit: 5000000 });
  console.log("Token has been deployed to:", wqt_token.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
