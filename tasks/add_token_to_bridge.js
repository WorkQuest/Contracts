task("add_token_to_bridge", "Add token settings to bridge")
    .addParam("symbol", "The token symbol")
    .addOptionalParam("lockable", "Is token lockable")
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
        if (!process.env.NATIVE_COIN) {
            throw new Error(`Please set your NATIVE_COIN in a .env-${network} file`);
        }

        const bridge = await hre.ethers.getContractAt("WQBridge", process.env.BRIDGE);
        let native = false;
        let token_addr = process.env[`${args.symbol}_TOKEN`];
        let lockable = true;
        // if (!args.lockable) { lockable = false; }
        if (args.symbol == process.env.NATIVE_COIN) {
            native = true;
            token_addr = "0x0000000000000000000000000000000000000000";
            lockable = false;
        }
        if(!token_addr){
            throw new Error(`Please set your ${args.symbol}_TOKEN in a .env-${network} file`);
        }
        console.log(`Trying add ${args.symbol} token ${token_addr} to bridge ${bridge.address}`);
        await bridge.updateToken(token_addr, true, native, lockable, args.symbol);
        console.log("Done")
    });