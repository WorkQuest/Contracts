const hre = require("hardhat");

async function main() {
  require('dotenv').config();
  const accounts = await ethers.getSigners();
  const sender = accounts[0].address;
  console.log("Sender address: ", sender);

  console.log("Deploying...");
  const PensionWalletFactory = await hre.ethers.getContractFactory("PensionWalletFactory");
  const pension_wallet_factory = await PensionWalletFactory.deploy();
  await pension_wallet_factory.deployed();
  console.log("PensionWalletFactory has been deployed to:", pension_wallet_factory.address);


  const WorkQuestFactory = await hre.ethers.getContractFactory("WorkQuestFactory");
  const work_quest_factory = await WorkQuestFactory.deploy(process.env.WORKQUEST_FEE, process.env.WORKQUEST_FEE_RECEIVER, pension_wallet_factory.address);
  await work_quest_factory.deployed();
  console.log("WorkQuestFactory has been deployed to:", work_quest_factory.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
