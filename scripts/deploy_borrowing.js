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
    if (!process.env.PRICE_ORACLE) {
        throw new Error(`Please set your PRICE_ORACLE in a .env-${network} file`);
    }
    if (!process.env.BORROWING_FIXED_RATE) {
        throw new Error(`Please set your BORROWING_FIXED_RATE in a .env-${network} file`);
    }
    if (!process.env.BORROWING_FEE_RECEIVER) {
        throw new Error(`Please set your BORROWING_FEE_RECEIVER in a .env-${network} file`);
    }
    if (!process.env.BORROWING_FEE) {
        throw new Error(`Please set your BORROWING_FEE in a .env-${network} file`);
    }
    if (!process.env.ETH_TOKEN) {
        throw new Error(`Please set your ETH_TOKEN in a .env-${network} file`);
    }
    if (!process.env.BNB_TOKEN) {
        throw new Error(`Please set your BNB_TOKEN in a .env-${network} file`);
    }
    // if (!process.env.WQT_TOKEN) {
    //     throw new Error(`Please set your WQT_TOKEN in a .env-${network} file`);
    // }
    if (!process.env.WUSD_TOKEN) {
        throw new Error(`Please set your WUSD_TOKEN in a .env-${network} file`);
    }
    if (!process.env.PENSION_FUND) {
        throw new Error(`Please set your PENSION_FUND in a .env-${network} file`);
    }
    if (!process.env.LENDING) {
        throw new Error(`Please set your LENDING in a .env-${network} file`);
    }
    if (!process.env.SAVING_PRODUCT) {
        throw new Error(`Please set your SAVING_PRODUCT in a .env-${network} file`);
    }

    console.log("Deploying...");
    const Borrowing = await hre.ethers.getContractFactory("WQBorrowing");
    const borrowing = await upgrades.deployProxy(
        Borrowing,
        [
            process.env.PRICE_ORACLE,
            process.env.BORROWING_FIXED_RATE,
            process.env.WUSD_TOKEN,
            process.env.BORROWING_FEE_RECEIVER,
            process.env.BORROWING_FEE
        ],
        { initializer: 'initialize' }
    );
    console.log("Borrowing has been deployed to:", borrowing.address);

    envConfig["BORROWING"] = borrowing.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));

    await borrowing.setApy(7, parseEther("0.0451"));
    await borrowing.setApy(14, parseEther("0.0467"));
    await borrowing.setApy(30, parseEther("0.0482"));
    await borrowing.setApy(90, parseEther("0.0511"));
    await borrowing.setApy(180, parseEther("0.0523"));
    console.log("APY setting complete");

    await borrowing.setToken(process.env.ETH_TOKEN, "ETH");
    await borrowing.setToken(process.env.BNB_TOKEN, "BNB");
    // await borrowing.setToken(process.env.WQT_TOKEN, "WQT");
    console.log("Token setting complete");

    await borrowing.addFund(process.env.PENSION_FUND);
    await borrowing.addFund(process.env.LENDING);
    await borrowing.addFund(process.env.SAVING_PRODUCT);
    console.log("Funds setting complete");

    const pension = await hre.ethers.getContractAt("WQPensionFund", process.env.PENSION_FUND);
    await pension.grantRole(await pension.BORROWER_ROLE(), borrowing.address);
    const lending = await hre.ethers.getContractAt("WQLending", process.env.LENDING);
    await lending.grantRole(await lending.BORROWER_ROLE(), borrowing.address);
    const saving = await hre.ethers.getContractAt("WQSavingProduct", process.env.SAVING_PRODUCT);
    await saving.grantRole(await saving.BORROWER_ROLE(), borrowing.address);
    console.log("Set borrower roles complete");
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
