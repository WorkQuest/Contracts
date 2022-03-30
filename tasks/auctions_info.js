task("auctions_info", "Get Auctions Info")
    .addOptionalParam("price", "Price index")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        const sur = await ethers.getContractAt("WQSurplusAuction", process.env.SURPLUS_AUCTION);
        const deb = await ethers.getContractAt("WQDebtAuction", process.env.DEBT_AUCTION);
        const aue = await ethers.getContractAt("WQCollateralAuction", process.env.ETH_AUCTION);
        const aub = await ethers.getContractAt("WQCollateralAuction", process.env.BNB_AUCTION);

        console.log("Surplus:", await sur.getSurplusAmount() / 1e18, "Auctioned:", await sur.totalAuctioned() / 1e18);
        console.log("Debt:", await deb.getDebtAmount() / 1e18, "Auctioned:", await deb.totalAuctioned() / 1e18);
        console.log("Liquidated ETH:", await aue.getLiquidatedCollaterallAmount() / 1e18, "Auctioned ETH:", await aue.totalAuctioned() / 1e18);
        // console.log("Liquidated BNB:", await aub.getLiquidatedCollaterallAmount() / 1e18, "Auctioned BNB:", await aub.totalAuctioned() / 1e18);

        let price_indexes = await aue.getPriceIndexes(0, 20);
        for (let k in price_indexes) {
            console.log((price_indexes[k]).toString());
        }

        price_indexes = await aub.getPriceIndexes(0, 20);
        for (let k in price_indexes) {
            console.log((price_indexes[k]).toString());
        }

        if (args.price) {
            console.log(`Lots in priceIndex ${args.price}:`);
            console.log(await aue.getLots(args.price, 0, 20));
            console.log(await aub.getLots(args.price, 0, 20));
        }
    });