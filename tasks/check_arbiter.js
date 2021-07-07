task("check_arbiter", "Update arbiter in workquest factory")
    .addParam("arbiter", "The arbiter address")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);
        const work_quest_factory = await hre.ethers.getContractAt("WorkQuestFactory", process.env.WORK_QUEST_FACTORY);
        console.log("Is arbiter:", await work_quest_factory.arbiters(args.arbiter));
    });