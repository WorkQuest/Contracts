task("set_price", "Set price of token")
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
        let symbol, price;
        if (args.eth) {
            symbol = "ETH";
            price = await ethers.utils.parseEther(args.eth);
        }
        if (args.bnb) {
            symbol = "BNB";
            price = await ethers.utils.parseEther(args.bnb);
        }
        if (args.wqt) {
            symbol = "WQT";
            price = await ethers.utils.parseEther(args.wqt);
        }
        let message = web3.utils.soliditySha3(
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: price.toString() },
            { t: 'string', v: symbol }
        );
        let signature = await web3.eth.sign(message, accounts[0].address);
        let sig = ethers.utils.splitSignature(signature);
        let tx = await priceOracle.setTokenPriceUSD(nonce, price, sig.v, sig.r, sig.s, symbol);
        console.log("fee:", (tx.gasPrice * tx.gasLimit)/1e18);
    });