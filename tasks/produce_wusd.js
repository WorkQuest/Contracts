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

        const router = await ethers.getContractAt("WQRouter", process.env.ROUTER);
        // const token = await ethers.getContractAt("wBNB", process.env[`${args.symbol}_TOKEN`]);
        // await token.connect(accounts[parseInt(args.account)]).approve(router.address, args.amount);
        let tx = await router.connect(accounts[parseInt(args.account)]).produceWUSD(args.amount, args.ratio, args.symbol);
        console.log(tx.hash);
    });