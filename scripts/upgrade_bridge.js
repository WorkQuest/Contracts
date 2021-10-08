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
  if (!process.env.WQT_TOKEN) {
    throw new Error(`Please set your WQT_TOKEN in a .env-${network} file`);
  }

  console.log("Upgrade...");
  const WQBridge = await ethers.getContractFactory("WQBridge");
  const bridge = await upgrades.upgradeProxy(process.env.BRIDGE, WQBridge);
  console.log("Bridge has been upgraded to:", bridge.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });