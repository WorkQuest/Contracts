const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

async function main() {
  require('dotenv').config();
  const accounts = await ethers.getSigners();
  const sender = accounts[0].address;
  console.log("Sender address: ", sender);

  console.log("Deploying...");
  const WQToken = await ethers.getContractFactory("WQToken");
  const wqt_token = await upgrades.deployProxy(WQToken, [process.env.TOKEN_TOTAL_SUPPLY], {initializer: 'initialize'});
  console.log("Proxy of WQT has been deployed to:", wqt_token.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });