task("exchange_wqt", "Change old WQT tokens with new")
    .addParam("amount", "Amount of tokens")
    .setAction(async function (args, hre, runSuper) {
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        dotenv.config();
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) {process.env[k] = envConfig[k];}
        if (!process.env.OLD_WQT_TOKEN) {
            throw new Error(`Please set your OLD_WQT_TOKEN in a .env-${network} file`);
        }
        if (!process.env.WORK_QUEST_TOKEN) {
            throw new Error(`Please set your WORK_QUEST_TOKEN in a .env-${network} file`);
        }

        console.log("Sender address: ", sender);

        const WQToken = await hre.ethers.getContractAt("WQToken", process.env.OLD_WQT_TOKEN);
        const WQTExchange = await hre.ethers.getContractAt("WQTExchange", process.env.WQT_EXCHANGE);

        console.log("Try to exchange old token with new\n", "Old token address:", WQToken.address);
        // await WQToken.approve(process.env.WQT_EXCHANGE, args.amount);
        await WQTExchange.swap(args.amount, {gasLimit: 500000});
        console.log("Success!");
    });
