task("buy_lot", "Buy lot")
    .addParam("user", "Account number")
    .addOptionalParam("eth", "Eth index")
    .addOptionalParam("bnb", "Bnb index")
    .addOptionalParam("usdt", "USDT index")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const acc = await ethers.getSigners();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        let index;
        if (args.eth) {
            index = args.eth;
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.ETH_AUCTION);
        }
        if (args.bnb) {
            index = args.bnb;
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.BNB_AUCTION);
        }
        if (args.usdt) {
            index = args.usdt;
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.USDT_AUCTION);
        }
        let tx = await auction.connect(acc[parseInt(args.user)]).buyLot(index);
        console.log(tx.hash);
    });