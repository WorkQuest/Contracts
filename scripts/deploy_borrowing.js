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
            process.env.BORROWING_FIXED_RATE,
            process.env.BORROWING_FEE,
            process.env.BORROWING_AUCTION_DURATION,
            process.env.PRICE_ORACLE,
            process.env.WUSD_TOKEN,
            process.env.BORROWING_FEE_RECEIVER,

        ],
        { initializer: 'initialize' }
    );
    console.log("Borrowing has been deployed to:", borrowing.address);

    envConfig["BORROWING"] = borrowing.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));

    //lending
    await borrowing.setApy(7, parseEther("0.1594"));
    await borrowing.setApy(14, parseEther("0.1626"));
    await borrowing.setApy(21, parseEther("0.1652"));
    await borrowing.setApy(28, parseEther("0.1714"));
    await borrowing.setApy(35, parseEther("0.1738"));

    //saving
    await borrowing.setApy(60, parseEther("0.0963"));
    await borrowing.setApy(90, parseEther("0.098"));
    await borrowing.setApy(120, parseEther("0.0998"));
    await borrowing.setApy(150, parseEther("0.1032"));
    await borrowing.setApy(180, parseEther("0.1082"));

    //pension
    await borrowing.setApy(360, parseEther("0.115"));
    await borrowing.setApy(540, parseEther("0.1244"));
    await borrowing.setApy(720, parseEther("0.1247"));
    await borrowing.setApy(900, parseEther("0.1391"));
    await borrowing.setApy(1080, parseEther("0.1535"));
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
