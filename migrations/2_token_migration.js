var MyContract = artifacts.require("WQToken");
const { parseEther } = require("ethers/utils");


module.exports = function (deployer) {
    require('dotenv').config();
    deployer.deploy(MyContract, parseEther(process.env.TOKEN_TOTAL_SUPPLY));
};