
task("add_refs", "Add referrals to contract")
    .setAction(async function (args, hre, runSuper) {
        require('dotenv').config();
        const accounts = await ethers.getSigners();
        const sender = accounts[0].address;
        console.log("Sender address: ", sender);
        const network = hre.network.name;
        const fs = require('fs');
        const dotenv = require('dotenv');
        const envConfig = dotenv.parse(fs.readFileSync(`.env-${network}`))
        for (const k in envConfig) { process.env[k] = envConfig[k]; }

        if (!process.env.REFERRAL) {
            throw new Error(`Plese set your REFERRAL in a .env-${network} file`)
        }

        console.log(`Try add referral addresses to contract`);
        let aff = '0xE24f99419d788003c0D5212f05F47B1572cDC38a';
        let refs = ["0x4010bd4565c1eedbdd6ecee4ba87b869921e8cf6"];
        // const ref = await hre.ethers.getContractAt("Test", "0x5FbDB2315678afecb367f032d93F642f64180aa3");

        let msg = await web3.utils.soliditySha3({ t: 'address', v: aff }, { t: 'address', v: refs })
        let signature = await web3.eth.sign(msg, accounts[0].address);
        let sig = ethers.utils.splitSignature(signature);

        // let v = "0x1b";
        // let r = "0x8f258f6f23b6feae072b0ffc8992c05ccbf38e74f037a80e544a081c6538cc46";
        // let s = "0x542651a7b09c47a3e3a009263b8dff6ee6fb2580d154defe40d1a1a8f7b34065";

        // console.log(await ref.test(aff, v, r, s, refs));
        const ref = await hre.ethers.getContractAt("WQReferral", process.env.REFERRAL);
        console.log(await ref.addReferrals(sig.v, sig.r, sig.s, refs));
    });
