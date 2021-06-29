const hre = require("hardhat");

async function main() {
  require('dotenv').config();
  let token_owner;
  [_, token_owner] = await hre.ethers.getSigners();
  const WorkLabor = await hre.ethers.getContractFactory("WorkLabor", token_owner);
  const work_labor = await WorkLabor.deploy(process.env.WORKLABOR_FEE, process.env.WORKLABOR_FEE_RECEIVER);
  console.log("WorkLabor smart contract address:", work_labor.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
