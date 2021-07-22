task("add_bridge_token", "Add token settings to bridge")
    .addParam("symbol", "Symbol of token")
    .addParam("token", "Address of token")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);

        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) {
            process.env[k] = envConfig[k]
        }
        if (!process.env.BRIDGE) {
            throw new Error(`Please set your BRIDGE in a .env-${network} file`);
        }
        if (!process.env.NATIVE_COIN) {
            throw new Error(`Please set your NATIVE_COIN in a .env-${network} file`);
        }
        const bridge = await hre.ethers.getContractAt("WQBridge", process.env.WORK_QUEST_TOKEN);
        let native = false;
        let token_addr = args.token;
        if (args.symbol == NATIVE_COIN) {
            native = true;
            token_addr = "0x0000000000000000000000000000000000000000"
        }
        await bridge.updateToken(token_addr, true, native, args.symbol);
    });