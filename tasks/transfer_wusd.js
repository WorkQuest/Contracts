task("transfer_wusd", "Transfer WUSD tokens to recipient")
    .addParam("to", "The recipient address")
    .addParam("amount", "Amount of tokens")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);

        const WUSDToken = await hre.ethers.getContractFactory("WUSDToken");
        const wusd_token = await WUSDToken.attach(process.env.WUSD_TOKEN);
        console.log("Token address:", wusd_token.address);
        await wq_token.transfer(args.to, args.amount, { gasLimit: 500000 });
    });
