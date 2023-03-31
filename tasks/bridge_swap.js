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
        if (!process.env.BRIDGE) {
            throw new Error(`Please set your BRIDGE in a .env-${network} file`);
        }
        // if (!process.env.USDT_TOKEN) {
        //     throw new Error('Please set your USDT_TOKEN in a .env file');
        // }

        // console.log("Swap on bridge:", process.env.BRIDGE);
        const bridge = await hre.ethers.getContractAt( "WQBridge", process.env.BRIDGE );
        await bridge.pool()
        // const wqt = await hre.ethers.getContractAt("WQBridgeToken", process.env.USDT_TOKEN);
        // await wqt.approve(process.env.STABLE_BRIDGE, "1000000000");
        // nonce, chainTo, amount, recipient, symbol
        // await bridge.swap(100500, 1, "11000000", "0x3b4da64210cc0de7c9a187c314e51983aa1d5304", "USDC");
        // console.log("Done");
        // const pool = await hre.ethers.getContractAt(
        //     'WQBridgePool',
        //     process.env.BRIDGE_POOL
        // )
        // const usdt = await hre.ethers.getContractAt(
        //     'WQBridgeToken',
        //     process.env.USDT_TOKEN // 5000000000000000000
        // )

        console.log(await bridge.pool())

    });