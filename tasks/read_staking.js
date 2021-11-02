task("read_staking", "Read transactions and print")
    .addParam("tx", "Transaction hash")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        dotenv.config();
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        let tx = await web3.eth.getTransaction(args.tx);
        let block = await web3.eth.getBlock(tx.blockNumber);

        let func_name = tx.input.slice(0, 10);
        if (func_name == "0x7b0472f0") {
            let decoded = await web3.eth.abi.decodeParameters(
                [
                    { type: 'uint256', name: 'amount' },
                    { type: 'uint256', name: 'duration' }
                ],
                '0x' + tx.input.slice(10)
            );
            console.log(`{ user: \"${tx.from}\", amount: \"${decoded.amount}\", duration: \"${decoded.duration}\", timestamp: \"${block.timestamp}\"}`);
        }
        else if (func_name == "0x4e71d92d") {
            console.log(`{ user: \"${tx.from}\", timestamp: \"${block.timestamp}\"}`);
        }
    });
