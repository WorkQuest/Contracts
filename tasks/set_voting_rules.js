task("set_voting_rules", "Set rules of voting")
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
        if (!process.env.DAO_BALLOT) {
            throw new Error(`Please set your DAO_BALLOT in a .env-${network} file`);
        }
        if (!process.env.DAO_MINIMUM_QUORUM) {
            throw new Error(`Please set your DAO_MINIMUM_QUORUM in a .env-${network} file`);
        }
        if (!process.env.DAO_VOTING_PERIOD) {
            throw new Error(`Please set your DAO_VOTING_PERIOD in a .env-${network} file`);
        }

        console.log(`Try set rules to voting`);
        const voting = await hre.ethers.getContractAt("WQDAOVoting", process.env.DAO_BALLOT);
        await voting.changeVotingRules(process.env.DAO_MINIMUM_QUORUM, process.env.DAO_VOTING_PERIOD);
        console.log("Done");
    });