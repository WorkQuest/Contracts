task("router_info", "Get Router Info")
    .addOptionalParam("account", "Account number")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        const rou = await ethers.getContractAt("WQRouter", process.env.ROUTER);
        let debt = await rou.totalDebt() / 1e18;
        let coll = await rou.totalCollateral() / 1e36;
        console.log("debt: ", debt, "collateral:", coll);
        console.log("ratio:", coll / debt);

        if (args.account) {
            let acc = accounts[parseInt(args.account)].address;
            console.log("Account ", acc)

            let eth_lots = await rou.getUserLots(acc, 0, 100, "ETH");
            console.log("eth lots:");
            for (let i in eth_lots) {
                console.log((eth_lots[i].priceIndex).toString(), (eth_lots[i].index).toString());
            }

            let bnb_lots = await rou.getUserLots(acc, 0, 100, "BNB");
            console.log("bnb lots:");
            for (let i in bnb_lots) {
                console.log((bnb_lots[i].priceIndex).toString(), (bnb_lots[i].index).toString());
            }
        }
    });