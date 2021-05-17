var MyContract = artifacts.require("WUSDToken");
const { parseEther } = require("ethers/utils");


module.exports = function (deployer) {
    require('dotenv').config();
    deployer.deploy(MyContract, parseEther(process.env.TOKEN_TOTAL_SUPPLY));
};