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

        let weth = await priceOracle.tokens("ETH");
        let wbnb = await priceOracle.tokens("BNB");
        let wqt = await priceOracle.tokens("WQT");
        let usdt = await priceOracle.tokens("USDT");
        let usdc = await priceOracle.tokens("USDC");

        let eth_upd = parseInt(weth.updatedTime);
        let bnb_upd = parseInt(wbnb.updatedTime);
        let wqt_upd = parseInt(wqt.updatedTime);
        let usdt_upd = parseInt(usdt.updatedTime);
        let usdc_upd = parseInt(usdc.updatedTime);
        let valid = parseInt(await priceOracle.validTime());

        console.log("ETH:", valid - cur + eth_upd, weth.maxRatio / 1e18, weth.price / 1e18);
        console.log("BNB:", valid - cur + bnb_upd, wbnb.maxRatio / 1e18, wbnb.price / 1e18);
        console.log("WQT:", valid - cur + wqt_upd, wqt.maxRatio / 1e18, wqt.price / 1e18);
        console.log("USDT:", valid - cur + usdt_upd, usdt.maxRatio / 1e18, usdt.price / 1e18);
        console.log("USDC:", valid - cur + usdc_upd, usdc.maxRatio / 1e18, usdc.price / 1e18);
    });