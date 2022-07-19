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
        let usdc_upd = parseInt((await priceOracle.tokens("USDC")).updatedTime);
        let valid = parseInt(await priceOracle.validTime());

        console.log("ETH:", valid - cur + eth_upd, (await priceOracle.tokens("ETH")).maxRatio / 1e18, (await priceOracle.tokens("ETH")).price / 1e18);
        console.log("BNB:", valid - cur + bnb_upd, (await priceOracle.tokens("BNB")).maxRatio / 1e18, (await priceOracle.tokens("BNB")).price / 1e18);
        console.log("WQT:", valid - cur + wqt_upd, (await priceOracle.tokens("WQT")).maxRatio / 1e18, (await priceOracle.tokens("WQT")).price / 1e18);
        console.log("USDT:", valid - cur + usdt_upd, (await priceOracle.tokens("USDT")).maxRatio / 1e18, (await priceOracle.tokens("USDT")).price / 1e18);
        console.log("USDC:", valid - cur + usdc_upd, (await priceOracle.tokens("USDC")).maxRatio / 1e18, (await priceOracle.tokens("USDC")).price / 1e18);
    });