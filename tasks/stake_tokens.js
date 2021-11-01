task("stake_tokens", "Stake tokens to staking contracts")
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
        if (!process.env.STAKING) {
            throw new Error(`Please set your STAKING in a .env-${network} file`);
        }
        if (!process.env.WQT_TOKEN) {
            throw new Error(`Please set your WQT_TOKEN in a .env-${network} file`);
        }

        const Staking = await hre.ethers.getContractAt("WQStaking", process.env.STAKING);
        const Token = await hre.ethers.getContractAt("ERC20", process.env.WQT_TOKEN);
        await Token.approve(process.env.STAKING, args.amount, {gasLimit: 500000});
        await Staking.stake(args.amount, 30, {gasLimit: 500000});

        console.log("Success!");
    });
