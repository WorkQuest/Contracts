const { ethers, upgrades } = require("hardhat");
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
  if (!process.env.WORKQUEST_FEE_EMPLOYER) {
    throw new Error(`Please set your WORKQUEST_FEE_EMPLOYER in a .env-${network} file`);
  }
  if (!process.env.WORKQUEST_FEE_WORKER) {
    throw new Error(`Please set your WORKQUEST_FEE_WORKER in a .env-${network} file`);
  }
  if (!process.env.WORKQUEST_FEE_RECEIVER) {
    throw new Error(`Please set your WORKQUEST_FEE_RECEIVER in a .env-${network} file`);
  }
  if (!process.env.PENSION_FUND) {
    throw new Error(`Please set your PENSION_FUND in a .env-${network} file`);
  }
  if (!process.env.REFERRAL) {
    throw new Error(`Please set your REFERRAL in a .env-${network} file`);
  }
  if (!process.env.WUSD_TOKEN) {
    throw new Error(`Please set your WUSD_TOKEN in a .env-${network} file`);
  }
  console.log("Deploying...");
  const WorkQuestFactory = await hre.ethers.getContractFactory("WorkQuestFactory");
  const work_quest_factory = await upgrades.deployProxy(
    WorkQuestFactory,
    [
      process.env.WORKQUEST_FEE_EMPLOYER,
      process.env.WORKQUEST_FEE_WORKER,
      process.env.WORKQUEST_FEE_RECEIVER,
      process.env.PENSION_FUND,
      process.env.REFERRAL,
      process.env.WUSD_TOKEN
    ],
    { initializer: 'initialize' });
  console.log("WorkQuestFactory has been deployed to:", work_quest_factory.address);

  envConfig["WORK_QUEST_FACTORY"] = work_quest_factory.address;
  fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
