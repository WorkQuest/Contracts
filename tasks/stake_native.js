task("stake_native", "Stake native coins to StakingNative contracts")
    .addParam("amount", "Amount of tokens")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        dotenv.config();
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }
        if (!process.env.STAKING_NATIVE) {
            throw new Error(`Please set your STAKING in a .env-${network} file`);
        }
        const StakingNative = await hre.ethers.getContractAt("WQStakingNative", process.env.STAKING_NATIVE);
        await StakingNative.stake({value: args.amount, gasLimit: 500000});

        console.log("Success!");
    });
