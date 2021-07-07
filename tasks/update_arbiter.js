task("update_arbiter", "Update arbiter in workquest factory")
    .addParam("arbiter", "The arbiter address")
    .addParam("enabled", "Enable - true, disable -false")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);
        const work_quest_factory = await hre.ethers.getContractAt("WorkQuestFactory");
        await work_quest_factory.updateArbiter(args.arbiter, args.enabled);
        
    });