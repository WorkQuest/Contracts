task("claim_debt", "Claim extra debt")
    .addParam("symbol", "Token symbol")
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
        let tx = await router.connect(accounts[parseInt(args.account)]).claimExtraDebt(args.index, args.symbol);
        console.log(tx.hash);
    });