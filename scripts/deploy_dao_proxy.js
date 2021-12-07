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
  if (!process.env.DAO_CHAIR_PERSON) {
    throw new Error(`Please set your DAO_CHAIR_PERSON in a .env-${network} file`);
  }
  if (!process.env.WQT_TOKEN) {
    throw new Error(`Please set your WQT_TOKEN in a .env-${network} file`);
  }

  console.log("Deploying...");
  const DAOBallot = await hre.ethers.getContractFactory("WQDAOVoting");
  const dao_ballot = await upgrades.deployProxy(DAOBallot,
    [
      process.env.DAO_CHAIR_PERSON,
      process.env.WQT_TOKEN,
      process.env.DAO_MINIMUM_QUORUM,
      process.env.DAO_VOTING_PERIOD
    ], { initializer: 'initialize' })
  console.log("DAO Ballot has been deployed to:", dao_ballot.address);

  envConfig["DAO_BALLOT"] = dao_ballot.address;
  fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
