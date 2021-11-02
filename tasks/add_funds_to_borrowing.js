task("add_funds_to_borrowing", "Add funds to borrowing contract")
    .setAction(async function (args, hre, runSuper) {
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
        if (!process.env.PENSION_FUND) {
            throw new Error(`Please set your PENSION_FUND in a .env-${network} file`);
        }
        if (!process.env.DEPOSIT) {
            throw new Error(`Please set your DEPOSIT in a .env-${network} file`);
        }

        console.log("Try to add funds contracts to borrowing:", args.chain);
        const borrowing = await hre.ethers.getContractAt("WQBorrowing", process.env.BORROWING);
        await borrowing.addFund(process.env.PENSION_FUND);
        await borrowing.addFund(process.env.DEPOSIT);
        console.log("Done")
    });