task("config_pension", "Config pension fund")
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
        if (!process.env.PENSION_FUND) {
            throw new Error(`Please set your PENSION_FUND in a .env-${network} file`);
        }
        const pension_fund = await hre.ethers.getContractAt("WQPensionFund", process.env.PENSION_FUND);
        await pension_fund.setApy(360, parseEther("0.0644"));
        await pension_fund.setApy(540, parseEther("0.0644"));
        await pension_fund.setApy(720, parseEther("0.0644"));
        await pension_fund.setApy(900, parseEther("0.0644"));
        await pension_fund.setApy(1080, parseEther("0.0644"));
        console.log("Done.")
    });

