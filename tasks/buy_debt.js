task("buy_debt", "Buy debt")
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

        const auction = await ethers.getContractAt("WQDebtAuction", process.env.DEBT_AUCTION);
        console.log("Debt:", await auction.getDebtAmount() / 1e12);
        let acc = accounts[parseInt(args.account)];
        await auction.connect(acc).startAuction(args.amount);
        // await auction.connect(acc).buyLot(args.amount, {value: "1000000000000000000"});
        // console.log(await auction.getCurrentLotCost(args.amount) / 1e18);
        console.log(await auction.auctionDuration() / 1);
    });