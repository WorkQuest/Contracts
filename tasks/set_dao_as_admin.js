task("set_dao_as_admin", "set DAOVoting contract as admin for all contracts")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        dotenv.config();
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`));
        for (const k in envConfig) { process.env[k] = envConfig[k]; }
        if (!process.env.WORK_QUEST_FACTORY) {
            throw new Error(`Please set your WORK_QUEST_FACTORY in a .env-${network} file`);
        }
        if (!process.env.BRIDGE) {
            throw new Error(`Please set your BRIDGE in a .env-${network} file`);
        }
        if (!process.env.PENSION_FUND) {
            throw new Error(`Please set your PENSION_FUND in a .env-${network} file`);
        }
        if (!process.env.STAKING) {
            throw new Error(`Please set your STAKING in a .env-${network} file`);
        }
        if (!process.env.WQT_TOKEN) {
            throw new Error(`Please set your WQT_TOKEN in a .env-${network} file`);
        }
        if (!process.env.DAO_BALLOT) {
            throw new Error(`Please set your DAO_BALLOT in a .env-${network} file`);
        }

        // all to WQDAOVoting
        const WQFactory = await hre.ethers.getContractAt("WorkQuestFactory", process.env.WORK_QUEST_FACTORY);
        const WQBridge = await hre.ethers.getContractAt("WQBridge", process.env.BRIDGE);
        const WQPensionFund = await hre.ethers.getContractAt("WQPensionFund", process.env.PENSION_FUND);
        const WQStaking = await hre.ethers.getContractAt("WQStaking", process.env.STAKING);
        const WQToken = await hre.ethers.getContractAt("WQToken", process.env.WQT_TOKEN);
        const WQDAOVoting = await hre.ethers.getContractAt("WQDAOVoting", process.env.DAO_BALLOT);

        const ADMIN_ROLE = await WQFactory.ADMIN_ROLE();

        console.log("Start granting ADMIN_ROLE to DAO...")
        await WQFactory.grantRole(ADMIN_ROLE, WQDAOVoting.address);
        await WQBridge.grantRole(ADMIN_ROLE, WQDAOVoting.address);
        await WQPensionFund.grantRole(ADMIN_ROLE, WQDAOVoting.address);
        await WQStaking.grantRole(ADMIN_ROLE, WQDAOVoting.address);
        await WQToken.grantRole(ADMIN_ROLE, WQDAOVoting.address);
        console.log("ADMIN_ROLE was granted to DAO")

    });