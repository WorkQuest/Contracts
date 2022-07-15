task("start_auction", "Start auction")
    .addParam("id", "Index of lot")
    .addOptionalParam("eth", "ETH amount")
    .addOptionalParam("bnb", "BNB amount")
    .addOptionalParam("usdt", "USDT amount")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        let amount;
        let auction;
        if (args.eth) {
            symbol = "ETH";
            amount = await ethers.utils.parseEther(args.eth);
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.ETH_AUCTION);
        }
        if (args.bnb) {
            symbol = "BNB";
            amount = await ethers.utils.parseEther(args.bnb);
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.BNB_AUCTION);
        }
        if (args.usdt) {
            symbol = "USDT";
            amount = await ethers.utils.parseEther(args.usdt);
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.USDT_AUCTION);
        }

        let tx = await auction.startAuction(args.id, amount);
        console.log(tx.hash);
    });