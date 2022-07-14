task("start_auction", "Start auction")
    .addParam("index", "Index of lot")
    .addOptionalParam("eth", "Eth amount")
    .addOptionalParam("bnb", "Bnb amount")
    .addOptionalParam("usdt", "Bnb amount")
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
            amount = args.eth;
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.ETH_AUCTION);
        }
        if (args.bnb) {
            symbol = "BNB";
            amount = args.bnb;
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.BNB_AUCTION);
        }
        if (args.usdt) {
            symbol = "USDT";
            amount = args.usdt;
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.USDT_AUCTION);
        }

        let tx = await auction.startAuction(args.index, amount);
        console.log(tx.hash);
    });