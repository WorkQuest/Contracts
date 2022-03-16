task("grant_roles_for_bridge", "Grant roles for bridge in tokens and pool")
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
        if (!process.env.WQT_TOKEN) {
            throw new Error('Please set your WQT_TOKEN in a .env file');
        }
        if (!process.env.NATIVE_COIN) {
            throw new Error('Please set your NATIVE_COIN in a .env file');
        }

        console.log("Bridge:", process.env.BRIDGE);

        console.log("Grant roles in WorkQuest Token:", process.env.WQT_TOKEN);
        const wqt = await hre.ethers.getContractAt("WQToken", process.env.WQT_TOKEN);
        let minter_role = await wqt.MINTER_ROLE();
        let burner_role = await wqt.BURNER_ROLE();
        await wqt.grantRole(minter_role, process.env.BRIDGE);
        await wqt.grantRole(burner_role, process.env.BRIDGE);
        console.log('wqt minter:', await wqt.hasRole(minter_role, process.env.BRIDGE), 'wqt burner:', await wqt.hasRole(burner_role, process.env.BRIDGE));

        if (process.env.NATIVE_COIN != "ETH") {
            console.log("Grant roles in ETH Token:", process.env.ETH_TOKEN);
            const eth_token = await hre.ethers.getContractAt("WQBridgeToken", process.env.ETH_TOKEN);
            let minter_role = await eth_token.MINTER_ROLE();
            let burner_role = await eth_token.BURNER_ROLE();
            await eth_token.grantRole(minter_role, process.env.BRIDGE);
            await eth_token.grantRole(burner_role, process.env.BRIDGE);
            console.log('eth minter:', await eth_token.hasRole(minter_role, process.env.BRIDGE), 'eth burner:', await eth_token.hasRole(burner_role, process.env.BRIDGE));
        }

        if (process.env.NATIVE_COIN != "BNB") {
            console.log("Grant roles in BNB Token:", process.env.BNB_TOKEN);
            const bnb_token = await hre.ethers.getContractAt("WQBridgeToken", process.env.BNB_TOKEN);
            let minter_role = await bnb_token.MINTER_ROLE();
            let burner_role = await bnb_token.BURNER_ROLE();
            await bnb_token.grantRole(minter_role, process.env.BRIDGE);
            await bnb_token.grantRole(burner_role, process.env.BRIDGE);
            console.log('bnb minter:', await bnb_token.hasRole(minter_role, process.env.BRIDGE), 'bnb burner:', await bnb_token.hasRole(burner_role, process.env.BRIDGE));
        }

        console.log("Grant roles in pool:", process.env.BRIDGE_POOL);
        const pool = await hre.ethers.getContractAt("WQBridgePool", process.env.BRIDGE_POOL);
        let bridge_role = await pool.BRIDGE_ROLE();
        await pool.grantRole(bridge_role, process.env.BRIDGE);
        console.log('pool bridge:', await pool.hasRole(bridge_role, process.env.BRIDGE));

        console.log("Grant validator role in bridge:", process.env.BRIDGE);
        const bridge = await hre.ethers.getContractAt("WQBridge", process.env.BRIDGE);
        await bridge.grantRole(await bridge.VALIDATOR_ROLE(), process.env.BRIDGE_VALIDATOR);
        console.log(await bridge.hasRole(await bridge.VALIDATOR_ROLE(), process.env.BRIDGE_VALIDATOR));
        console.log("Done");
    });