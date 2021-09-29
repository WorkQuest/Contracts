task("grant_roles_for_exchange", "Grant minter role to exchange")
    .addOptionalParam("to", "Address of validator")
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
        if (!process.env.WQT_EXCHANGE) {
            throw new Error(`Please set your WQT_EXCHANGE in a .env-${network} file`);
        }
        if (!process.env.WQT_TOKEN) {
            throw new Error(`Please set your WQT_TOKEN in a .env-${network} file`);
        }

        console.log("Grant minter role to WQT Exchange:", process.env.WQT_EXCHANGE);
        const token = await hre.ethers.getContractAt("WQBridgeToken", process.env.WQT_TOKEN);
        let minter_role = await token.MINTER_ROLE();
        // await token.grantRole(minter_role, process.env.WQT_EXCHANGE);
        console.log('WQT Exchange has minter role:', await token.hasRole(minter_role, process.env.WQT_EXCHANGE));

        console.log("Done");
    });