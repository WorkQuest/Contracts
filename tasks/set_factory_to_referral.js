task("set_factory_to_referral", "Set workquest factory address to referral contract")
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
            throw new Error(`Plese set your WORK_QUEST_FACTORY in a .env-${network} file`)
        }
        if (!process.env.REFERRAL) {
            throw new Error(`Plese set your REFERRAL in a .env-${network} file`)
        }

        console.log(`Try set rules to voting`);
        const ref = await hre.ethers.getContractAt("WQReferral", process.env.REFERRAL);
        await ref.updateFactory(process.env.WORK_QUEST_FACTORY);
        console.log("Done");
    });