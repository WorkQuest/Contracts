task("set_prices", "Set all prices of tokens")
    .addOptionalParam("eth", "ETH price")
    .addOptionalParam("bnb", "BNB price")
    .addOptionalParam("wqt", "WQT price")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        const priceOracle = await ethers.getContractAt("WQPriceOracle", process.env.PRICE_ORACLE);
        let nonce = parseInt(await priceOracle.lastNonce()) + 1;
        let symbols = [];
        let prices = [];
        if (args.eth) {
            symbols.push("ETH");
            prices.push(await ethers.utils.parseEther(args.eth));
        }
        if (args.bnb) {
            symbols.push("BNB");
            prices.push(await ethers.utils.parseEther(args.bnb));
        }
        if (args.wqt) {
            symbols.push("WQT");
            prices.push(await ethers.utils.parseEther(args.wqt));
        }
        console.log(symbols, prices);
        let message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: prices },
            { t: 'string', v: symbols }
        );
        let signature = await web3.eth.sign(message, accounts[0].address);
        let sig = ethers.utils.splitSignature(signature);
        let tx = await priceOracle.setTokenPricesUSD(nonce, sig.v, sig.r, sig.s, prices, symbols);
        console.log("fee:", (tx.gasPrice * tx.gasLimit) / 1e18);
    });