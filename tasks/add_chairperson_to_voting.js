task("add_chairperson_to_voting", "Add chairperson role to voting")
    .addParam("to", "The account address")
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

        console.log(`Try to add chairperson ${args.to} to voting`);
        const voting = await hre.ethers.getContractAt("WQDAOVoting", process.env.DAO_BALLOT);
        await voting.grantRole(await voting.CHAIRPERSON_ROLE(), args.to);
        console.log("Done");
    });