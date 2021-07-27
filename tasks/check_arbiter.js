task("check_arbiter", "Check arbiter is in workquest factory")
    .addParam("arbiter", "The arbiter address")
    .setAction(async function (args, hre, runSuper) {
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);

        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        dotenv.config();
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) {
            process.env[k] = envConfig[k]
        }
        if (!process.env.WORK_QUEST_FACTORY) {
            throw new Error(`Please set your WORK_QUEST_FACTORY in a .env-${network} file`);
        }


        console.log("WorkQuestFactory address:", process.env.WORK_QUEST_FACTORY);
        const work_quest_factory = await hre.ethers.getContractAt("WorkQuestFactory", process.env.WORK_QUEST_FACTORY);
        console.log("Is arbiter:", await work_quest_factory.arbiters(args.arbiter));
        console.log("Arbiters:", await work_quest_factory.allArbiters());
    });