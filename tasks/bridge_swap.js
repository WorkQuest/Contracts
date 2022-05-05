task("bridge_swap", "Swap token on bridge")
    .setAction(async function (args, hre, runSuper) {
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);

        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        dotenv.config();
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }
        if (!process.env.STABLE_BRIDGE) {
            throw new Error(`Please set your BRIDGE in a .env-${network} file`);
        }
        if (!process.env.USDT_TOKEN) {
            throw new Error('Please set your USDT_TOKEN in a .env file');
        }

        console.log("Swap on bridge:", process.env.STABLE_BRIDGE);
        const bridge = await hre.ethers.getContractAt("WQBridge", process.env.STABLE_BRIDGE);
        // const wqt = await hre.ethers.getContractAt("WQBridgeToken", process.env.USDT_TOKEN);
        // await wqt.approve(process.env.STABLE_BRIDGE, "1000000000");
        // nonce, chainTo, amount, recipient, symbol
        await bridge.swap(4, 1, "31000000", "0xE24f99419d788003c0D5212f05F47B1572cDC38a", "USDT");
        console.log("Done");
    });