task("add_chains_to_bridge", "Add chain settings to bridge")
    .addParam("chain", "The chain ID")
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
        if (!process.env.BRIDGE) {
            throw new Error(`Please set your BRIDGE in a .env-${network} file`);
        }

        console.log("Try to add chain to bridge:", args.chain);
        const bridge = await hre.ethers.getContractAt("WQBridge", process.env.BRIDGE);
        await bridge.updateChain(args.chain, true);
        console.log("Done")
    });