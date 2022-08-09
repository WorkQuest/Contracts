task("grant_all", "Grant roles for bridge in tokens and pool")
    .addParam("user", "User address")
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

        if (!process.env.WUSD_TOKEN) {
            throw new Error(`Please set your WUSD_TOKEN in a .env-${network} file`);
        }
        const wusd = await ethers.getContractAt("WQBridgeToken", process.env.WUSD_TOKEN);
        await wusd.grantRole(await wusd.DEFAULT_ADMIN_ROLE(), args.user);
        await wusd.grantRole(await wusd.ADMIN_ROLE(), args.user);
        await wusd.grantRole(await wusd.UPGRADER_ROLE(), args.user);

        if (!process.env.ETH_TOKEN) {
            throw new Error(`Please set your ETH_TOKEN in a .env-${network} file`);
        }
        const weth = await ethers.getContractAt("WQBridgeToken", process.env.ETH_TOKEN);
        await weth.grantRole(await weth.DEFAULT_ADMIN_ROLE(), args.user);
        await weth.grantRole(await weth.ADMIN_ROLE(), args.user);
        await weth.grantRole(await weth.UPGRADER_ROLE(), args.user);

        if (!process.env.BNB_TOKEN) {
            throw new Error(`Please set your BNB_TOKEN in a .env-${network} file`);
        }
        const wbnb = await ethers.getContractAt("WQBridgeToken", process.env.BNB_TOKEN);
        await wbnb.grantRole(await wbnb.DEFAULT_ADMIN_ROLE(), args.user);
        await wbnb.grantRole(await wbnb.ADMIN_ROLE(), args.user);
        await wbnb.grantRole(await wbnb.UPGRADER_ROLE(), args.user);

        if (!process.env.USDT_TOKEN) {
            throw new Error(`Please set your USDT_TOKEN in a .env-${network} file`);
        }
        const usdt = await ethers.getContractAt("WQBridgeToken", process.env.USDT_TOKEN);
        await usdt.grantRole(await usdt.DEFAULT_ADMIN_ROLE(), args.user);
        await usdt.grantRole(await usdt.ADMIN_ROLE(), args.user);
        await usdt.grantRole(await usdt.UPGRADER_ROLE(), args.user);

        if (!process.env.USDC_TOKEN) {
            throw new Error(`Please set your USDC_TOKEN in a .env-${network} file`);
        }
        const usdc = await ethers.getContractAt("WQBridgeToken", process.env.USDC_TOKEN);
        await usdc.grantRole(await usdc.DEFAULT_ADMIN_ROLE(), args.user);
        await usdc.grantRole(await usdc.ADMIN_ROLE(), args.user);
        await usdc.grantRole(await usdc.UPGRADER_ROLE(), args.user);

        if (!process.env.BRIDGE_POOL) {
            throw new Error(`Please set your BRIDGE_POOL in a .env-${network} file`);
        }
        const pool = await ethers.getContractAt("WQBridgePool", process.env.BRIDGE_POOL);
        await pool.grantRole(await pool.DEFAULT_ADMIN_ROLE(), args.user);
        await pool.grantRole(await pool.ADMIN_ROLE(), args.user);
        await pool.grantRole(await pool.UPGRADER_ROLE(), args.user);

        if (!process.env.BRIDGE) {
            throw new Error(`Please set your BRIDGE in a .env-${network} file`);
        }
        const bridge = await ethers.getContractAt("WQBridge", process.env.BRIDGE);
        await bridge.grantRole(await bridge.DEFAULT_ADMIN_ROLE(), args.user);
        await bridge.grantRole(await bridge.ADMIN_ROLE(), args.user);
        await bridge.grantRole(await bridge.UPGRADER_ROLE(), args.user);

        if (!process.env.PRICE_ORACLE) {
            throw new Error(`Please set your PRICE_ORACLE in a .env-${network} file`);
        }
        const oracle = await ethers.getContractAt("WQPriceOracle", process.env.PRICE_ORACLE);
        await oracle.grantRole(await oracle.DEFAULT_ADMIN_ROLE(), args.user);
        await oracle.grantRole(await oracle.ADMIN_ROLE(), args.user);
        await oracle.grantRole(await oracle.UPGRADER_ROLE(), args.user);

        if (!process.env.PENSION_FUND) {
            throw new Error(`Please set your PENSION_FUND in a .env-${network} file`);
        }
        const pension_fund = await ethers.getContractAt("WQPensionFund", process.env.PENSION_FUND);
        await pension_fund.grantRole(await pension_fund.DEFAULT_ADMIN_ROLE(), args.user);
        await pension_fund.grantRole(await pension_fund.ADMIN_ROLE(), args.user);
        await pension_fund.grantRole(await pension_fund.UPGRADER_ROLE(), args.user);

        if (!process.env.REFERRAL) {
            throw new Error(`Please set your REFERRAL in a .env-${network} file`);
        }
        const referral = await ethers.getContractAt("WQReferral", process.env.REFERRAL);
        await referral.grantRole(await referral.DEFAULT_ADMIN_ROLE(), args.user);
        await referral.grantRole(await referral.ADMIN_ROLE(), args.user);
        await referral.grantRole(await referral.UPGRADER_ROLE(), args.user);

        if (!process.env.WORK_QUEST_FACTORY) {
            throw new Error(`Please set your WORK_QUEST_FACTORY in a .env-${network} file`);
        }
        const factory = await ethers.getContractAt("WorkQuestFactory", process.env.WORK_QUEST_FACTORY);
        await factory.grantRole(await factory.DEFAULT_ADMIN_ROLE(), args.user);
        await factory.grantRole(await factory.ADMIN_ROLE(), args.user);
        await factory.grantRole(await factory.UPGRADER_ROLE(), args.user);

        if (!process.env.DAO_BALLOT) {
            throw new Error(`Please set your DAO_BALLOT in a .env-${network} file`);
        }
        const dao = await ethers.getContractAt("WQDAOVoting", process.env.DAO_BALLOT);
        await dao.grantRole(await dao.DEFAULT_ADMIN_ROLE(), args.user);
        await dao.grantRole(await dao.ADMIN_ROLE(), args.user);
        await dao.grantRole(await dao.UPGRADER_ROLE(), args.user);

        if (!process.env.STAKING) {
            throw new Error(`Please set your STAKING in a .env-${network} file`);
        }
        const staking = await ethers.getContractAt("WQStakingWQT", process.env.STAKING);
        await staking.grantRole(await staking.DEFAULT_ADMIN_ROLE(), args.user);
        await staking.grantRole(await staking.ADMIN_ROLE(), args.user);
        await staking.grantRole(await staking.UPGRADER_ROLE(), args.user);

        if (!process.env.STAKING_NATIVE) {
            throw new Error(`Please set your STAKING_NATIVE in a .env-${network} file`);
        }
        const staking_native = await ethers.getContractAt("WQStakingWUSD", process.env.STAKING_NATIVE);
        await staking_native.grantRole(await staking_native.DEFAULT_ADMIN_ROLE(), args.user);
        await staking_native.grantRole(await staking_native.ADMIN_ROLE(), args.user);
        await staking_native.grantRole(await staking_native.UPGRADER_ROLE(), args.user);

        if (!process.env.LENDING) {
            throw new Error(`Please set your LENDING in a .env-${network} file`);
        }
        const lending = await ethers.getContractAt("WQLending", process.env.LENDING);
        await lending.grantRole(await lending.DEFAULT_ADMIN_ROLE(), args.user);
        await lending.grantRole(await lending.ADMIN_ROLE(), args.user);
        await lending.grantRole(await lending.UPGRADER_ROLE(), args.user);

        if (!process.env.SAVING_PRODUCT) {
            throw new Error(`Please set your SAVING_PRODUCT in a .env-${network} file`);
        }
        const saving = await ethers.getContractAt("WQSavingProduct", process.env.SAVING_PRODUCT);
        await saving.grantRole(await saving.DEFAULT_ADMIN_ROLE(), args.user);
        await saving.grantRole(await saving.ADMIN_ROLE(), args.user);
        await saving.grantRole(await saving.UPGRADER_ROLE(), args.user);

        if (!process.env.ROUTER) {
            throw new Error(`Please set your ROUTER in a .env-${network} file`);
        }
        const router = await ethers.getContractAt("WQRouter", process.env.ROUTER);
        await router.grantRole(await router.DEFAULT_ADMIN_ROLE(), args.user);
        await router.grantRole(await router.ADMIN_ROLE(), args.user);
        await router.grantRole(await router.UPGRADER_ROLE(), args.user);

        if (!process.env.ETH_AUCTION) {
            throw new Error(`Please set your ETH_AUCTION in a .env-${network} file`);
        }
        const aue = await ethers.getContractAt("WQCollateralAuction", process.env.ETH_AUCTION);
        await aue.grantRole(await aue.DEFAULT_ADMIN_ROLE(), args.user);
        await aue.grantRole(await aue.ADMIN_ROLE(), args.user);
        await aue.grantRole(await aue.UPGRADER_ROLE(), args.user);

        if (!process.env.BNB_AUCTION) {
            throw new Error(`Please set your BNB_AUCTION in a .env-${network} file`);
        }
        const aub = await ethers.getContractAt("WQCollateralAuction", process.env.BNB_AUCTION);
        await aub.grantRole(await aub.DEFAULT_ADMIN_ROLE(), args.user);
        await aub.grantRole(await aub.ADMIN_ROLE(), args.user);
        await aub.grantRole(await aub.UPGRADER_ROLE(), args.user);

        if (!process.env.USDT_AUCTION) {
            throw new Error(`Please set your USDT_AUCTION in a .env-${network} file`);
        }
        const auu = await ethers.getContractAt("WQCollateralAuction", process.env.USDT_AUCTION);
        await auu.grantRole(await auu.DEFAULT_ADMIN_ROLE(), args.user);
        await auu.grantRole(await auu.ADMIN_ROLE(), args.user);
        await auu.grantRole(await auu.UPGRADER_ROLE(), args.user);

        if (!process.env.USDC_AUCTION) {
            throw new Error(`Please set your USDC_AUCTION in a .env-${network} file`);
        }
        const auc = await ethers.getContractAt("WQCollateralAuction", process.env.USDC_AUCTION);
        await auc.grantRole(await auc.DEFAULT_ADMIN_ROLE(), args.user);
        await auc.grantRole(await auc.ADMIN_ROLE(), args.user);
        await auc.grantRole(await auc.UPGRADER_ROLE(), args.user);

        if (!process.env.LOCK_0) {
            throw new Error(`Please set your LOCK_0 in a .env-${network} file`);
        }
        const lock_0 = await ethers.getContractAt("WQLock", process.env.LOCK_0);

        if (!process.env.LOCK_1) {
            throw new Error(`Please set your LOCK_1 in a .env-${network} file`);
        }
        const lock_1 = await ethers.getContractAt("WQLock", process.env.LOCK_1);

        if (!process.env.LOCK_2) {
            throw new Error(`Please set your LOCK_2 in a .env-${network} file`);
        }
        const lock_2 = await ethers.getContractAt("WQLock", process.env.LOCK_2);

        if (!process.env.LOCK_3) {
            throw new Error(`Please set your LOCK_3 in a .env-${network} file`);
        }
        const lock_3 = await ethers.getContractAt("WQLock", process.env.LOCK_3);

        if (!process.env.LOCK_4) {
            throw new Error(`Please set your LOCK_4 in a .env-${network} file`);
        }
        const lock_4 = await ethers.getContractAt("WQLock", process.env.LOCK_4);
        console.log("Done");
    });