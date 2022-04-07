task("config_promotion", "Config pomotion contract")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const { parseEther } = require("ethers/lib/utils");
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);

        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        let promotion = await ethers.getContractAt("WQPromotion", process.env.PROMOTION);
        console.log("Try to config promotion...");
        await promotion.setUserTariff(3, 1, parseEther("7"));
        await promotion.setUserTariff(2, 1, parseEther("9"));
        await promotion.setUserTariff(1, 1, parseEther("12"));
        await promotion.setUserTariff(0, 1, parseEther("20"));
        await promotion.setUserTariff(3, 7, parseEther("18"));
        await promotion.setUserTariff(2, 7, parseEther("22"));
        await promotion.setUserTariff(1, 7, parseEther("28"));
        await promotion.setUserTariff(0, 7, parseEther("35"));
        await promotion.setUserTariff(3, 30, parseEther("21"));
        await promotion.setUserTariff(2, 30, parseEther("29"));
        await promotion.setUserTariff(1, 30, parseEther("35"));
        await promotion.setUserTariff(0, 30, parseEther("50"));

        await promotion.setQuestTariff(3, 1, parseEther("7"));
        await promotion.setQuestTariff(2, 1, parseEther("9"));
        await promotion.setQuestTariff(1, 1, parseEther("12"));
        await promotion.setQuestTariff(0, 1, parseEther("20"));
        await promotion.setQuestTariff(3, 5, parseEther("12"));
        await promotion.setQuestTariff(2, 5, parseEther("18"));
        await promotion.setQuestTariff(1, 5, parseEther("23"));
        await promotion.setQuestTariff(0, 5, parseEther("30"));
        await promotion.setQuestTariff(3, 7, parseEther("18"));
        await promotion.setQuestTariff(2, 7, parseEther("24"));
        await promotion.setQuestTariff(1, 7, parseEther("30"));
        await promotion.setQuestTariff(0, 7, parseEther("45"));
        console.log("Done.")
    });