const { ethers, upgrades } = require("hardhat");
const hre = require("hardhat");
const dotenv = require('dotenv');
const fs = require('fs');
const stringify = require('dotenv-stringify');
const { parseEther } = require("ethers/lib/utils");

async function main() {
    dotenv.config();
    const accounts = await ethers.getSigners();
    const sender = accounts[0].address;
    console.log("Sender address: ", sender);
    const network = hre.network.name;
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) { process.env[k] = envConfig[k]; }

    if (!process.env.WUSD_TOKEN) {
        throw new Error(`Please set your WUSD_TOKEN in a .env-${network} file`);
    }
    if (!process.env.WUSD_TOKEN) {
        throw new Error(`Please set your WUSD_TOKEN in a .env-${network} file`);
    }
    if (!process.env.SAVING_PRODUCT_FEE_RECEIVER) {
        throw new Error(`Please set your SAVING_PRODUCT_FEE_RECEIVER in a .env-${network} file`);
    }
    if (!process.env.SAVING_PRODUCT_FEE_PER_MONTH) {
        throw new Error(`Please set your SAVING_PRODUCT_FEE_PER_MONTH in a .env-${network} file`);
    }
    if (!process.env.SAVING_PRODUCT_FEE_WITHDRAW) {
        throw new Error(`Please set your SAVING_PRODUCT_FEE_WITHDRAW in a .env-${network} file`);
    }
    console.log("Deploying...");
    const SavingProduct = await hre.ethers.getContractFactory("WQSavingProduct");
    const saving = await upgrades.deployProxy(
        SavingProduct,
        [
            process.env.WUSD_TOKEN,
            process.env.SAVING_PRODUCT_FEE_RECEIVER,
            process.env.SAVING_PRODUCT_FEE_PER_MONTH,
            process.env.SAVING_PRODUCT_FEE_WITHDRAW
        ],
        { initializer: 'initialize' }
    );
    // const saving = await SavingProduct.attach(process.env.SAVING_PRODUCT);
    console.log("Saving Product has been deployed to:", saving.address);

    envConfig["SAVING_PRODUCT"] = saving.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));

    await saving.setApy(7, parseEther("0.0531"));
    await saving.setApy(14, parseEther("0.0548"));
    await saving.setApy(30, parseEther("0.0566"));
    await saving.setApy(90, parseEther("0.06"));
    await saving.setApy(180, parseEther("0.065"));
    console.log("APY setting complete");
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
