const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

async function main() {
  require('dotenv').config();
  const accounts = await ethers.getSigners();
  const sender = accounts[0].address;
  console.log("Sender address: ", sender);

  console.log("Upgrade...");
  const WQToken = await ethers.getContractFactory("WQToken");
  const wqt_token = await upgrades.upgradeProxy(process.env.WORK_QUEST_TOKEN, WQToken);
  console.log("Token has been upgraded to:", wqt_token.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });