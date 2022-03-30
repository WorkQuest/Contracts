const { ethers, upgrades } = require("hardhat");
const dotenv = require('dotenv');
const fs = require('fs');

async function main() {
  dotenv.config();
  const accounts = await ethers.getSigners();
  const sender = accounts[0].address;
  console.log("Sender address: ", sender);

  const network = hre.network.name;
  const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
  for (const k in envConfig) {
    process.env[k] = envConfig[k]
  }
  if (!process.env.PRICE_ORACLE) {
    throw new Error(`Please set your PRICE_ORACLE in a .env-${network} file`);
  }

  console.log("Upgrade...");
  const PriceOracle = await ethers.getContractFactory("WQPriceOracle");
  const price_oracle = await upgrades.upgradeProxy(process.env.PRICE_ORACLE, PriceOracle);
  console.log("Price oracle has been upgraded to:", price_oracle.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });