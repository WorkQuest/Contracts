const hre = require("hardhat");

async function main() {
  require('dotenv').config();
  const accounts = await ethers.getSigners();
  const sender = accounts[0].address;
  console.log("Sender address: ", sender);

  console.log("Deploying...");
  const PensionFund = await hre.ethers.getContractFactory("PensionFund");
  const pension_fund = await PensionFund.deploy(3*365*24*60*60);
  await pension_fund.deployed();
  console.log("PensionFund has been deployed to:", pension_fund.address);

  const WorkQuestFactory = await hre.ethers.getContractFactory("WorkQuestFactory");
  const work_quest_factory = await WorkQuestFactory.deploy(process.env.WORKQUEST_FEE, process.env.WORKQUEST_FEE_RECEIVER, pension_fund.address);
  await work_quest_factory.deployed();
  //FIXME: remove this from production
  await work_quest_factory.updateArbiter(sender, true);
  console.log("WorkQuestFactory has been deployed to:", work_quest_factory.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
