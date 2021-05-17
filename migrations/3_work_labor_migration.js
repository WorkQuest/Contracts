var MyContract = artifacts.require("WorkLabor");
const { parseEther } = require("ethers/utils");


module.exports = function (deployer) {
    require('dotenv').config();
    deployer.deploy(MyContract, process.env.WORKLABOR_FEE, process.env.WORKLABOR_FEE_RECEIVER);
};