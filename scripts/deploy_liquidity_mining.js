const { ethers, upgrades } = require("hardhat");
const dotenv = require('dotenv');
const fs = require('fs');
const stringify = require('dotenv-stringify');

async function main() {
  dotenv.config();
  const [sender] = await ethers.getSigners()
  console.log("Sender address: ", sender.address);

  const network = hre.network.name;
  const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
  for (const k in envConfig) { process.env[k] = envConfig[k] }

  if (!process.env.LIQUIDITY_MINING_REWARD_TOTAL) {
    throw new Error(`Please set your LIQUIDITY_MINING_REWARD_TOTAL in a .env-${network} file`);
  }
  if (!process.env.LIQUIDITY_MINING_START_TIME) {
    throw new Error(`Please set your LIQUIDITY_MINING_START_TIME in a .env-${network} file`);
  }
  if (!process.env.LIQUIDITY_MINING_DISTRIBUTION_TIME) {
    throw new Error(`Please set your LIQUIDITY_MINING_DISTRIBUTION_TIME in a .env-${network} file`);
  }
  if (!process.env.LIQUIDITY_MINING_REWARD_TOKEN) {
    throw new Error(`Please set your LIQUIDITY_MINING_REWARD_TOKEN in a .env-${network} file`);
  }
  if (!process.env.LIQUIDITY_MINING_STAKE_TOKEN) {
    throw new Error(`Please set your LIQUIDITY_MINING_STAKE_TOKEN in a .env-${network} file`);
  }

  console.log("Deploying...");
  const WQLiquidityMining = await ethers.getContractFactory("WQLiquidityMining");
  const mining = await upgrades.deployProxy(
    WQLiquidityMining,
    [
      process.env.LIQUIDITY_MINING_START_TIME,
      process.env.LIQUIDITY_MINING_REWARD_TOTAL,
      process.env.LIQUIDITY_MINING_DISTRIBUTION_TIME,
      process.env.LIQUIDITY_MINING_REWARD_TOKEN,
      process.env.LIQUIDITY_MINING_STAKE_TOKEN
    ],
    { initializer: 'initialize', kind: 'uups' }
  );
  console.log("Proxy of liquidity mining has been deployed to:", mining.address);

  envConfig["LIQUIDITY_MINING"] = mining.address;
  fs.writeFileSync(`.env-${network}`, stringify(envConfig));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });