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
  if (!process.env.DAO_BALLOT) {
    throw new Error(`Please set your DAO_BALLOT in a .env-${network} file`);
  }

  console.log("Upgrade...");
  const DAOVoting = await ethers.getContractFactory("WQDAOVoting");
  const voting = await upgrades.upgradeProxy(process.env.DAO_BALLOT, DAOVoting);
  console.log("Bridge has been upgraded to:", voting.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
