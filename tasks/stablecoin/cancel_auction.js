task("cancel_auction", "Cancel auction")
    .addParam("id", "Index of lot")
    .addParam("sym", "Token symbol")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        let amount;
        let auction;
        if (args.sym == "ETH") {
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.ETH_AUCTION);
        }
        if (args.sym == "BNB") {
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.BNB_AUCTION);
        }
        if (args.sym == "USDT") {
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.USDT_AUCTION);
        }
        if (args.sym == "USDC") {
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.USDC_AUCTION);
        }
        let tx = await auction.cancelAuction(args.id);
        console.log(tx.hash);
    });