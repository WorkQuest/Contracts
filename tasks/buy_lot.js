task("buy_lot", "Buy lot")
    .addParam("price", "Price of lot")
    .addParam("index", "Index of lot")
    .addOptionalParam("eth", "Eth amount")
    .addOptionalParam("bnb", "Bnb amount")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        let amount;
        let auction;
        if (args.eth) {
            symbol = "ETH";
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.ETH_AUCTION);
        }
        if (args.bnb) {
            symbol = "BNB";
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.BNB_AUCTION);
        }
        
        let tx = await auction.buyLot(args.price, args.index, {value: "100421000000000000000000"});
        console.log(tx.hash);
    });