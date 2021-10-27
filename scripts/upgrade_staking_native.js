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
  for (const k in envConfig) { process.env[k] = envConfig[k]; }
  if (!process.env.STAKING_NATIVE) {
    throw new Error(`Please set your STAKING_NATIVE in a .env-${network} file`);
  }

  console.log("Upgrade...");
  const WQStakingNative = await ethers.getContractFactory("WQStakingNative");
  const staking_native = await upgrades.upgradeProxy(process.env.STAKING_NATIVE, WQStakingNative, { kind: 'transparent' });
  console.log("WQStakingNative has been upgraded to:", staking_native.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });