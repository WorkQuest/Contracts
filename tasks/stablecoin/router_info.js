task("router_info", "Get Router Info")
    .addOptionalParam("account", "Account number")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        const rou = await ethers.getContractAt("WQRouter", process.env.ROUTER);

        if (args.account) {
            let acc = accounts[parseInt(args.account)].address;
            console.log("Account ", acc)
            console.log("eth lots:", await rou.getUserLots(acc, 0, 100, "ETH"));
            console.log("bnb lots:", await rou.getUserLots(acc, 0, 100, "BNB"));
            console.log("usdt lots:", await rou.getUserLots(acc, 0, 100, "USDT"));
            console.log("usdt lots:", await rou.getUserLots(acc, 0, 100, "USDC"));
        }
    });