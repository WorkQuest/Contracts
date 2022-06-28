task("config_stable_bridge", "Add token settings to stable bridge")
    .addParam("symbol", "The token symbol")
    .addParam("factor", "The token factor to 18 decimals")
    .addParam("min", "Minimum amount of tokens")
    .addParam("max", "Maximum amount of tokens")
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
        if (!process.env.BRIDGE_STABLE) {
            throw new Error(`Please set your NATIVE_COIN in a .env-${network} file`);
        }

        const bridge = await hre.ethers.getContractAt("WQBridgeStable", process.env.BRIDGE_STABLE);
        let token_addr = process.env[`${args.symbol}_TOKEN`];
        if (!token_addr) {
            throw new Error(`Please set your ${args.symbol}_TOKEN in a .env-${network} file`);
        }

        console.log(`Trying add ${args.symbol} token ${token_addr} to bridge ${bridge.address}`);
        await bridge.updateToken(token_addr, 1, args.factor, args.min, args.max, args.symbol);
        console.log("Done")
    });