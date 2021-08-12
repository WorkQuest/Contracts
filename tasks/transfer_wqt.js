task("transfer_wqt", "Transfer WQT tokens to recipient")
    .addParam("to", "The recipient address")
    .addParam("amount", "Amount of tokens")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        dotenv.config();
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) {
            process.env[k] = envConfig[k]
        }
        if (!process.env.WORK_QUEST_TOKEN) {
            throw new Error(`Please set your WORK_QUEST_TOKEN in a .env-${network} file`);
        }

        console.log("Sender address: ", sender);

        const WQToken = await hre.ethers.getContractFactory("WQToken");
        const wq_token = await WQToken.attach(process.env.WORK_QUEST_TOKEN);
        console.log("Token address:", wq_token.address);
        await wq_token.transfer(args.to, args.amount);
        console.log("Success!");
    });
