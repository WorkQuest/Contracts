const { ethers, upgrades} = require("hardhat");
const hre = require("hardhat");
const dotenv = require('dotenv');
const fs = require('fs');
const stringify = require('dotenv-stringify');

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
  if (!process.env.PENSION_LOCK_TIME) {
    throw new Error(`Please set your PENSION_LOCK_TIME in a .env-${network} file`);
  }

  if (!process.env.PENSION_DEFAULT_FEE) {
    throw new Error(`Please set your PENSION_DEFAULT_FEE in a .env-${network} file`);
  }

  console.log("Deploying...");
  const PensionFund = await hre.ethers.getContractFactory("WQPensionFund");
  const pension_fund = await upgrades.deployProxy(PensionFund, [process.env.PENSION_LOCK_TIME, process.env.PENSION_DEFAULT_FEE], { initializer: 'initialize'}) 
  console.log("PensionFund has been deployed to:", pension_fund.address);

  envConfig["PENSION_FUND"] = pension_fund.address;
  fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });