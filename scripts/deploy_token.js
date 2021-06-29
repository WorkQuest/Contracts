const hre = require("hardhat");
const { parseEther } = require("ethers/utils");
const fs = require('fs');

async function main() {
  require('dotenv').config();
  const WUSDToken = await hre.ethers.getContractFactory("WUSDToken");
  const wusd_token = await WUSDToken.deploy(parseEther(process.env.TOKEN_TOTAL_SUPPLY), { gasLimit: 5000000 });
  console.log("Token address:", wusd_token.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
