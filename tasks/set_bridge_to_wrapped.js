task("set_bridge_to_wrapped", "Set bridge address to token")
    .setAction(async function (args, hre, runSuper) {
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);

        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        dotenv.config();
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) {
            process.env[k] = envConfig[k]
        }
        if (!process.env.BRIDGE) {
            throw new Error(`Please set your BRIDGE in a .env-${network} file`);
        }
        if (!process.env.STAKE_TOKEN) {
            throw new Error('Please set your STAKE_TOKEN in a .env file');
        }

        console.log(`Trying to set Bridge address to ${process.env.BRIDGE_TOKEN_SYMBOL} token`);
        console.log("Bridge:", process.env.BRIDGE);
        console.log("Token:", process.env.STAKE_TOKEN);

        const token = await hre.ethers.getContractAt("BridgeToken", process.env.STAKE_TOKEN);
        await token.grantRole(await token.BRIDGE_ROLE(), process.env.BRIDGE);

        console.log("Done");
    });