const { ethers, upgrades } = require("hardhat");
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
  if (!process.env.TOKEN_TOTAL_SUPPLY) {
    throw new Error(`Please set your TOKEN_TOTAL_SUPPLY in a .env-${network} file`);
  }

  console.log("Deploying...");
  const WQToken = await ethers.getContractFactory("WQToken");
  const wqt_token = await upgrades.deployProxy(WQToken, [process.env.TOKEN_TOTAL_SUPPLY], { initializer: 'initialize', gasPrice: "10000000000", gasLimit: "5000000" });
  console.log("Proxy of WQT has been deployed to:", wqt_token.address);

  envConfig["WQT_TOKEN"] = wqt_token.address;
  fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });