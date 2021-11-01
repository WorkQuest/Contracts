task("stake_liquidity", "Stake LP-tokens to liquidity mining contract")
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
        if (!process.env.LIQUIDITY_MINING) {
            throw new Error(`Please set your LIQUIDITY_MINING in a .env-${network} file`);
        }
        if (!process.env.LIQUIDITY_MINING_STAKE_TOKEN) {
            throw new Error(`Please set your LIQUIDITY_MINING_STAKE_TOKEN in a .env-${network} file`);
        }

        const Mining = await hre.ethers.getContractAt("WQLiquidityMining", process.env.LIQUIDITY_MINING);
        const Token = await hre.ethers.getContractAt("ERC20", process.env.LIQUIDITY_MINING_STAKE_TOKEN);
        await Token.approve(process.env.LIQUIDITY_MINING, args.amount, {gasLimit: 500000});
        await Mining.stake(args.amount, {gasLimit: 500000});

        console.log("Success!");
    });
