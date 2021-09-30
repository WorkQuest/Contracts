task("bridge_redeem", "Redeem token on bridge")
    .setAction(async function (args, hre, runSuper) {
        const accounts = await ethers.getSigners();
        const validator = accounts[0].address;
        console.log("Sender address: ", validator);

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

        console.log("Redeem on bridge:", process.env.BRIDGE);
        const bridge = await hre.ethers.getContractAt("WQBridge", process.env.BRIDGE);
        message = await web3.utils.soliditySha3(
            { t: 'uint', v: 1 },
            { t: 'uint', v: "1000000000000000000" },
            { t: 'address', v: "0xB2e4bdBf8EceC7486C9CAd1510d9529e03D1dc45" },
            { t: 'uint256', v: 2 },
            { t: 'uint256', v: 3 },
            { t: 'string', v: "WQT" }
        );
        let signature = await web3.eth.sign(message, validator);
        let sig = ethers.utils.splitSignature(signature);
        await bridge.redeem(1, 2, "1000000000000000000", "0xB2e4bdBf8EceC7486C9CAd1510d9529e03D1dc45", sig.v, sig.r, sig.s, "WQT", {gasLimit: 500000});
        console.log("Done");
    });