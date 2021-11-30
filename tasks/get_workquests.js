task("get_workquests", "Get users workquest")
    .addParam("user", "Address of user")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }
        if (!process.env.WORK_QUEST_FACTORY) {
            throw new Error(`Please set your WORK_QUEST_FACTORY in a .env-${network} file`);
        }

        console.log("WorkQuests:");
        const wqf = await hre.ethers.getContractAt("WorkQuestFactory", process.env.WORK_QUEST_FACTORY);
        const WQ = await hre.ethers.getContractFactory("WorkQuest");
        let workquests = await wqf.getWorkQuests(args.user);
        for (let i in workquests) {
            let wq = await WQ.attach(workquests[i]);
            // console.log(await wq.getInfo());
            console.log(wq.address, await wq.status());
        }
    });