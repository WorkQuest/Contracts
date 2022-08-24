task("produce_wusd", "Produce WUSD")
    .addParam("am", "Token amount")
    .addParam("rat", "Collateral ratio")
    .addParam("user", "Account number")
    .addParam("sym", "Token symbol")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const acc = await ethers.getSigners();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        /**
                const or = await ethers.getContractAt("WQPriceOracle", process.env.PRICE_ORACLE)

                const wusd = await ethers.getContractAt("WQBridgeToken", process.env.WUSD_TOKEN)
                const usdt = await ethers.getContractAt("WQBridgeToken", process.env.USDT_TOKEN)
                const usdc = await ethers.getContractAt("WQBridgeToken", process.env.USDC_TOKEN)
                const weth = await ethers.getContractAt("WQBridgeToken", process.env.ETH_TOKEN)
                const wbnb = await ethers.getContractAt("WQBridgeToken", process.env.BNB_TOKEN)

                const rou = await ethers.getContractAt("WQRouter", process.env.ROUTER)
                const aue = await ethers.getContractAt("WQCollateralAuction", process.env.ETH_AUCTION)
                const aub = await ethers.getContractAt("WQCollateralAuction", process.env.BNB_AUCTION)
                const auu = await ethers.getContractAt("WQCollateralAuction", process.env.USDT_AUCTION)
                const auc = await ethers.getContractAt("WQCollateralAuction", process.env.USDC_AUCTION)

                const bor = await ethers.getContractAt("WQBorrowing", process.env.BORROWING)
                const lend = await ethers.getContractAt("WQLending", process.env.LENDING)
                const pens = await ethers.getContractAt("WQPensionFund", process.env.PENSION_FUND)
                const sav = await ethers.getContractAt("WQSavingProduct", process.env.SAVING_PRODUCT)

                const br = await ethers.getContractAt("WQBridge", process.env.BRIDGE)
                const pool = await ethers.getContractAt("WQBridge", process.env.BRIDGE_POOL)
                const brs = await ethers.getContractAt("WQBridgeStable", process.env.STABLE_BRIDGE)
        */

        const router = await ethers.getContractAt("WQRouter", process.env.ROUTER);
        let decimals = 18;
        if (args.sym == "USDT" || args.sym == "USDC") {
            decimals = 6;
        }
        let tx = await router.connect(acc[parseInt(args.user)]).produceWUSD(await ethers.utils.parseUnits(args.am, decimals), await ethers.utils.parseEther(args.rat), args.sym);
        console.log(tx.hash);
    });