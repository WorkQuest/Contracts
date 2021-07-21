task("set_bridge", "Set bridge address to token")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);

        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) {
            process.env[k] = envConfig[k]
        }
        if (!process.env.BRIDGE) {
            throw new Error(`Please set your BRIDGE in a .env-${network} file`);
        }
        if (!process.env.WORK_QUEST_TOKEN) {
            throw new Error('Please set your WORK_QUEST_TOKEN in a .env file');
        }

        console.log("Trying to set Bridge address to WorkQuest Token");
        console.log("Bridge:", process.env.BRIDGE);
        console.log("Token:", process.env.WORK_QUEST_TOKEN);

        const token = await hre.ethers.getContractAt("WQToken", process.env.WORK_QUEST_TOKEN);
        await token.setBridge(process.env.BRIDGE);

        console.log("Done");
    });