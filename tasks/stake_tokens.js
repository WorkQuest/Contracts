task("stake_tokens", "Stake tokens to staking contracts")
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

        const Token = await hre.ethers.getContractFactory("WQBridgeToken");
        const token = await upgrades.deployProxy(Token, ["Workquest Token", "WQT"], { initializer: 'initialize' });
        await token.deployed()
        await token.grantRole(await token.MINTER_ROLE(), accounts[0].address);
        for (let i = 0; i < 6; i++) {
            await token.mint(accounts[i].address, "1000000000000000000000000");
        }

        let blockNumber = await hre.ethers.provider.send("eth_blockNumber", []);
        let block = await hre.ethers.provider.send("eth_getBlockByNumber", [blockNumber, false]);
        let beginTime = parseInt(block.timestamp) + 100;

        const Staking = await hre.ethers.getContractFactory("WQStaking");
        await hre.ethers.provider.send("evm_setNextBlockTimestamp", [beginTime]);
        const staking = await upgrades.deployProxy(
            Staking,
            [
                parseInt(beginTime),
                process.env.REWARD_TOTAL,
                process.env.DISTRIBUTION_TIME,
                process.env.STAKE_PERIOD,
                process.env.CLAIM_PERIOD,
                process.env.MIN_STAKE,
                process.env.MAX_STAKE,
                token.address,
                token.address],
            { initializer: 'initialize', kind: 'uups' }
        );
        await staking.deployed();

        await token.mint(staking.address, "1000000000000000000000000");

        let txs = JSON.parse(fs.readFileSync('./stake_claim_txs.json'));
        for (let k in txs) {
            await hre.ethers.provider.send("evm_setNextBlockTimestamp", [parseInt(beginTime) + (parseInt(txs[k].timestamp) - parseInt(process.env.START_TIME))]);
            if (txs[k].amount) {
                let account = accounts[txs[k].user];
                await token.connect(account).approve(staking.address, txs[k].amount);
                await staking.connect(account).stake(txs[k].amount, txs[k].duration);
            }
            else {
                let account = accounts[txs[k].user];
                // console.log(await staking.connect(account).getClaim(account.address) / 1e18);
                await staking.connect(account).claim();
            }
        }
        console.log("tokensPerStake:", await staking.tokensPerStake());
        console.log("totalStaked:", await staking.totalStaked());
        console.log("totalDistributed:", await staking.totalDistributed());

        for (let i = 1; i < 6; i++) {
            console.log(i, ":\n", await staking.stakes(accounts[i].address));
        }
    });
