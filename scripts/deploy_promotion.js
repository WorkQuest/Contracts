const { ethers, upgrades } = require("hardhat");
const hre = require("hardhat");
const dotenv = require('dotenv');
const fs = require('fs');
const stringify = require('dotenv-stringify');
const { parseEther } = require("ethers/lib/utils");

async function main() {
    dotenv.config();
    const accounts = await ethers.getSigners();
    const sender = accounts[0].address;
    console.log("Sender address: ", sender);

    const network = hre.network.name;
    const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
    for (const k in envConfig) { process.env[k] = envConfig[k]; }

    if (!process.env.PROMOTION_FEE_RECEIVER) {
        throw new Error(`Please set your PROMOTION_FEE_RECEIVER in a .env-${network} file`);
    }
    if (!process.env.WORK_QUEST_FACTORY) {
        throw new Error(`Plese set your WORK_QUEST_FACTORY in a .env-${network} file`)
    }
    if (!process.env.WQT_TOKEN) {
        throw new Error(`Plese set your WQT_TOKEN in a .env-${network} file`)
    }
    if (!process.env.PRICE_ORACLE) {
        throw new Error(`Plese set your PRICE_ORACLE in a .env-${network} file`)
    }
    console.log("Deploying...");
    const Promotion = await hre.ethers.getContractFactory("WQPromotion");
    const promotion = await upgrades.deployProxy(Promotion, [process.env.PROMOTION_FEE_RECEIVER, process.env.WORK_QUEST_FACTORY, process.env.WQT_TOKEN, process.env.PRICE_ORACLE], { initializer: 'initialize', kind: 'uups' })
    console.log("Promotion has been deployed to:", promotion.address);

    envConfig["PROMOTION"] = promotion.address;
    fs.writeFileSync(`.env-${network}`, stringify(envConfig));

    await promotion.setUserTariff(1, 1, parseEther("7"));
    await promotion.setUserTariff(2, 1, parseEther("9"));
    await promotion.setUserTariff(3, 1, parseEther("12"));
    await promotion.setUserTariff(4, 1, parseEther("20"));
    await promotion.setUserTariff(1, 7, parseEther("18"));
    await promotion.setUserTariff(2, 7, parseEther("22"));
    await promotion.setUserTariff(3, 7, parseEther("28"));
    await promotion.setUserTariff(4, 7, parseEther("35"));
    await promotion.setUserTariff(1, 30, parseEther("21"));
    await promotion.setUserTariff(2, 30, parseEther("29"));
    await promotion.setUserTariff(3, 30, parseEther("35"));
    await promotion.setUserTariff(4, 30, parseEther("50"));

    await promotion.setQuestTariff(1, 1, parseEther("7"));
    await promotion.setQuestTariff(2, 1, parseEther("9"));
    await promotion.setQuestTariff(3, 1, parseEther("12"));
    await promotion.setQuestTariff(4, 1, parseEther("20"));
    await promotion.setQuestTariff(1, 5, parseEther("12"));
    await promotion.setQuestTariff(2, 5, parseEther("18"));
    await promotion.setQuestTariff(3, 5, parseEther("23"));
    await promotion.setQuestTariff(4, 5, parseEther("30"));
    await promotion.setQuestTariff(1, 7, parseEther("18"));
    await promotion.setQuestTariff(2, 7, parseEther("24"));
    await promotion.setQuestTariff(3, 7, parseEther("30"));
    await promotion.setQuestTariff(4, 7, parseEther("45"));
    console.log("Configuration done");
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
