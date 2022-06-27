task("produce_wusd", "Produce WUSD")
    .addParam("symbol", "Token symbol")
    .addParam("amount", "Token amount")
    .addParam("ratio", "Collateral ratio")
    .addParam("account", "Account number")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        /**
                const wusd = await ethers.getContractAt("WQBridgeToken", process.env.WUSD_TOKEN)
                const usdt = await ethers.getContractAt("WQBridgeToken", process.env.USDT_TOKEN)
                const weth = await ethers.getContractAt("WQBridgeToken", process.env.ETH_TOKEN)
                const wbnb = await ethers.getContractAt("WQBridgeToken", process.env.BNB_TOKEN)
                const rou = await ethers.getContractAt("WQRouter", process.env.ROUTER)    
                const aue = await ethers.getContractAt("WQCollateralAuction", process.env.ETH_AUCTION)
                const aub = await ethers.getContractAt("WQCollateralAuction", process.env.BNB_AUCTION)
                const auu = await ethers.getContractAt("WQCollateralAuction", process.env.USDT_AUCTION)
        */

        const router = await ethers.getContractAt("WQRouter", process.env.ROUTER);

        let tx = await router.connect(accounts[parseInt(args.account)]).produceWUSD(args.amount, args.ratio, args.symbol);
        console.log(tx.hash);
    });