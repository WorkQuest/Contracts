task("config_price_oracle", "Config price oracle")
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

        let oracle = await ethers.getContractAt("WQPriceOracle", process.env.PRICE_ORACLE);
        console.log("Try to add token to price oracle...");
        await oracle.updateToken(1, "WQT");
        await oracle.updateToken(1, "ETH");
        await oracle.updateToken(1, "BNB");
        await oracle.updateToken(1, "USDT");
        console.log("Done.")
    });