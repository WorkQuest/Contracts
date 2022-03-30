task("buy_surplus", "Buy surplus")
    .addParam("account", "Account number")
    .addParam("amount", "Token amount")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        const auction = await ethers.getContractAt("WQSurplusAuction", process.env.SURPLUS_AUCTION);
        console.log("Surplus:", await auction.getSurplusAmount() / 1);
        let acc = accounts[parseInt(args.account)];
        // await auction.connect(acc).startAuction(args.amount);
        // await auction.connect(acc).cancelLot(args.amount);
        await auction.connect(acc).buyLot(args.amount, 0);

    });