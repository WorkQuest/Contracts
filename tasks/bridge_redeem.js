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

        console.log("Redeem on bridge:", process.env.BRIDGE);
        const bridge = await hre.ethers.getContractAt("WQBridge", process.env.BRIDGE);
        message = await web3.utils.soliditySha3({ t: 'uint', v: 2 },{ t: 'uint', v: "1000" },{ t: 'address', v: "0x42F41630aED8c6E1381108A32b5554E0DF75d9dc" },{ t: 'uint256', v: 2 },{ t: 'uint256', v: 1 },{ t: 'string', v: "WQT" });
        let signature = await web3.eth.sign(message, validator);
        let sig = ethers.utils.splitSignature(signature);
        console.log(await bridge.redeem(2, 2, "1000", "0x42F41630aED8c6E1381108A32b5554E0DF75d9dc", sig.v, sig.r, sig.s, "WQT"));
        console.log("Done");
    });