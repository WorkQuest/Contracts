task("prices", "Get all prices")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        const priceOracle = await ethers.getContractAt("WQPriceOracle", process.env.PRICE_ORACLE);
        let cur = (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        let eth_upd = parseInt((await priceOracle.tokens("ETH")).updatedTime);
        let bnb_upd = parseInt((await priceOracle.tokens("BNB")).updatedTime);
        let wqt_upd = parseInt((await priceOracle.tokens("WQT")).updatedTime);
        let usdt_upd = parseInt((await priceOracle.tokens("USDT")).updatedTime);
        let valid = parseInt(await priceOracle.validTime());
        console.log("ETH:", (await priceOracle.tokens("ETH")).price / 1e18, valid - cur + eth_upd);
        console.log("BNB:", (await priceOracle.tokens("BNB")).price / 1e18, valid - cur + bnb_upd);
        console.log("WQT:", (await priceOracle.tokens("WQT")).price / 1e18, valid - cur + wqt_upd);
        console.log("USDT:", (await priceOracle.tokens("USDT")).price / 1e18, valid - cur + usdt_upd);
    });