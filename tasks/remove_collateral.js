task("remove_collateral", "Remove part of collateral")
    .addParam("price", "Price of lot")
    .addParam("index", "Index of lot")
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
        const aue = await ethers.getContractAt("WQCollateralAuction", process.env.ETH_AUCTION);
        await router.connect(accounts[parseInt(args.account)]).removeCollateral(await aue.getPriceIndex(args.price), args.index, "100000000000000000000", "ETH", { value: "200000000000000000000" });
    });