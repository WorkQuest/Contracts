task("config_borrowing", "Config borrowers roles in funds")
    .setAction(async function (args, hre, runSuper) {
        const { parseEther } = require("ethers/lib/utils");
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        if (!process.env.BORROWING) {
            throw new Error(`Please set your BORROWING in a .env-${network} file`);
        }
        if (!process.env.ETH_TOKEN) {
            throw new Error(`Please set your ETH_TOKEN in a .env-${network} file`);
        }
        if (!process.env.BNB_TOKEN) {
            throw new Error(`Please set your BNB_TOKEN in a .env-${network} file`);
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
        const borrowing = await hre.ethers.getContractAt("WQBorrowing", process.env.BORROWING);
        console.log("Try to config borrowing:")

        // //lending
        // await borrowing.setApy(7, parseEther("0.1594"));
        // await borrowing.setApy(14, parseEther("0.1626"));
        // await borrowing.setApy(21, parseEther("0.1652"));
        // await borrowing.setApy(28, parseEther("0.1714"));
        // await borrowing.setApy(35, parseEther("0.1738"));

        // //saving
        // await borrowing.setApy(60, parseEther("0.0963"));
        // await borrowing.setApy(90, parseEther("0.098"));
        // await borrowing.setApy(120, parseEther("0.0998"));
        // await borrowing.setApy(150, parseEther("0.1032"));
        // await borrowing.setApy(180, parseEther("0.1082"));

        // //pension
        // await borrowing.setApy(360, parseEther("0.115"));
        // await borrowing.setApy(540, parseEther("0.1244"));
        // await borrowing.setApy(720, parseEther("0.1247"));
        // await borrowing.setApy(900, parseEther("0.1391"));
        // await borrowing.setApy(1080, parseEther("0.1535"));
        // console.log("APY setting complete");

        // await borrowing.setToken(process.env.ETH_TOKEN, "ETH");
        // await borrowing.setToken(process.env.BNB_TOKEN, "BNB");
        // await borrowing.setToken(process.env.WQT_TOKEN, "WQT");
        // console.log("Token setting complete");

        // await borrowing.addFund(process.env.PENSION_FUND);
        // await borrowing.addFund(process.env.LENDING);
        // await borrowing.addFund(process.env.SAVING_PRODUCT);
        // await borrowing.updateFund(0, process.env.PENSION_FUND);
        await borrowing.updateFund(1, process.env.LENDING);
        // await borrowing.updateFund(2, process.env.SAVING_PRODUCT);
        console.log("Funds setting complete");

        // const pension = await hre.ethers.getContractAt("WQPensionFund", process.env.PENSION_FUND);
        // await pension.grantRole(await pension.BORROWER_ROLE(), borrowing.address);
        const lending = await hre.ethers.getContractAt("WQLending", process.env.LENDING);
        await lending.grantRole(await lending.BORROWER_ROLE(), borrowing.address);
        // const saving = await hre.ethers.getContractAt("WQSavingProduct", process.env.SAVING_PRODUCT);
        // await saving.grantRole(await saving.BORROWER_ROLE(), borrowing.address);
        console.log("Set borrower roles complete");
    });