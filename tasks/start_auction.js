task("start_auction", "Start auction")
    .addParam("id", "Index of lot")
    .addParam("am", "Tokens amount")
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
            amount = await ethers.utils.parseEther(args.am);
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.ETH_AUCTION);
        }
        if (args.sym == "BNB") {
            amount = await ethers.utils.parseEther(args.am);
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.BNB_AUCTION);
        }
        if (args.sym == "USDT") {
            amount = await ethers.utils.parseUnits(args.am, 6);
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.USDT_AUCTION);
        }
        if (args.sym == "USDC") {
            amount = await ethers.utils.parseUnits(args.am, 6);
            auction = await ethers.getContractAt("WQCollateralAuction", process.env.USDC_AUCTION);
        }
        let tx = await auction.startAuction(args.id, amount);
        console.log(tx.hash);
    });