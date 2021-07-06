const Web3 = require("web3");
const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'));
const { expect } = require("chai");
const { ethers } = require("hardhat");
require("@nomiclabs/hardhat-waffle");
const { parseEther } = require("ethers/utils");

const nullstr = "0x0000000000000000000000000000000000000000"
const job_hash = web3.utils.keccak256("JOBHASH");
const cost = parseEther("1");
const comission = parseEther("0.01");
const cost_comission = parseEther("1.01");
const reward = parseEther("0.99");
const double_comission = parseEther("0.02");
const forfeit = parseEther("0.1");
const cost_after_forfeit = parseEther("0.9");
const reward_after_forfeit = parseEther("0.891");
const comission_after_forfeit = parseEther("0.009");
const double_comission_after_forfeit = parseEther("0.019");
const acces_denied_err = "WorkQuest: Access denied or invalid status";
const WORKQUEST_FEE="10000000000000000";

const JobStatus = Object.freeze({
  New: 0,
  Published: 1,
  Assigned: 2,
  InProcess: 3,
  Verification: 4,
  Rework: 5,
  DecreasedCost: 6,
  Arbitration: 7,
  Accepted: 8,
  Declined: 9
});

const setStatus = Object.freeze({
  publishJob: 0,
  assignJob: 1,
  processJob: 2,
  verificationJob: 3,
  decreaseCostJob: 4,
  arbitrationJob: 5,
  reworkJob: 6,
});

let work_quest_owner;
let employer;
let worker;
let arbiter;
let feeReceiver;
let work_quest_factory;
let work_quest;

describe("Work Quest contract", () => {
  let call_flow;

  beforeEach(async () => {
    require('dotenv').config();
    [work_quest_owner, employer, worker, arbiter, feeReceiver] = await ethers.getSigners();

    const PensionFund = await hre.ethers.getContractFactory("PensionFund");
    const pension_fund = await PensionFund.deploy();
    await pension_fund.deployed();

    const WorkQuestFactory = await hre.ethers.getContractFactory("WorkQuestFactory");
    work_quest_factory = await WorkQuestFactory.deploy(WORKQUEST_FEE, feeReceiver.address, pension_fund.address);
    await work_quest_factory.deployed();

    await work_quest_factory.updateArbiter(arbiter.address, true);

    await work_quest_factory.connect(employer).newWorkQuest(job_hash, cost);
    let work_quest_address = (await work_quest_factory.getWorkQuests(employer.address))[0];
    work_quest = await hre.ethers.getContractAt("WorkQuest", work_quest_address);

    call_flow = [
      { func: web3.eth.sendTransaction, args: [{ from: employer.address, to: work_quest.address, value: cost_comission }] },
      { func: work_quest.connect(employer).assignJob, args: [worker.address] },
      { func: work_quest.connect(worker).processJob, args: [] },
      { func: work_quest.connect(worker).verificationJob, args: [] },
      { func: work_quest.connect(employer).decreaseCostJob, args: [forfeit] },
      { func: work_quest.connect(worker).arbitrationJob, args: [] },
      { func: work_quest.connect(arbiter).reworkJob, args: [] }
    ];
  });


  describe("Deployment", () => {
    it("Should set the admin roles to creator and fee", async () => {
      var default_admin_role = await work_quest_factory.DEFAULT_ADMIN_ROLE();
      var admin_role = await work_quest_factory.ADMIN_ROLE();
      expect(
        await work_quest_factory.connect(work_quest_owner).hasRole(default_admin_role, work_quest_owner.address)
      ).to.equal(true);
      expect(
        await work_quest_factory.connect(work_quest_owner).hasRole(admin_role, work_quest_owner.address)
      ).to.equal(true);
      expect(
        await work_quest_factory.connect(work_quest_owner).fee()
      ).to.equal(WORKQUEST_FEE);
      expect(
        await work_quest_factory.connect(work_quest_owner).feeReceiver()
      ).to.equal(feeReceiver.address);
    });
  });


  describe("New job", () => {
    it("Create new job: success", async () => {
      //New job
      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(nullstr);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.New);
    });
  });

  describe("Publish job", () => {
    it("Publish job: success", async () => {
      await call_flow[setStatus.publishJob].func(...call_flow[setStatus.publishJob].args);
      let info = await work_quest.connect(employer).getInfo();
      expect(info[6]).to.be.equal(JobStatus.Published);
    });

    it("Publish job from other statuses: fail", async () => {
      for (let val of call_flow) {
        await val.func(...val.args);
        try {
          await call_flow[setStatus.publishJob].func(...call_flow[setStatus.publishJob].args);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });
  });

  describe("Assign worker to job", () => {
    it("Assigning job: success", async () => {
      //Assign job
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.assignJob + 1)) {
        await val.func(...val.args);
      }

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[6]).to.be.equal(JobStatus.Assigned);
    });

    it("Assigning worker to job from not employer: fail", async () => {
      //Publish job
      await call_flow[setStatus.publishJob].func(...call_flow[setStatus.publishJob].args);
      try {
        await work_quest.connect(worker).assignJob(...call_flow[setStatus.assignJob].args);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });

    it("Assigning invalid worker: fail", async () => {
      //Publish job
      await call_flow[setStatus.publishJob].func(...call_flow[setStatus.publishJob].args);
      try {
        await work_quest.connect(employer).assignJob(nullstr);
      } catch (e) {
        await expect(e.message).to.include('WorkQuest: Invalid address');
      }
    });

    it("Assign job from non Public statuses: fail", async () => {
      try {
        await work_quest.connect(employer).assignJob(...call_flow[setStatus.assignJob].args);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }

      await call_flow[setStatus.publishJob].func(...call_flow[setStatus.publishJob].args);

      for (let val of call_flow.slice(setStatus.assignJob)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).assignJob(...call_flow[setStatus.assignJob].args);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });
  });


  describe("Process job", () => {
    it("Job status set InProcess from Assigned: success", async () => {
      //Set InProcess job
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.processJob + 1)) {
        await val.func(...val.args);
      }

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.InProcess);
    });

    it("Job status set InProcess from Rework: success", async () => {
      //Set Rework status
      for (let val of call_flow) {
        await val.func(...val.args);
      }

      await call_flow[setStatus.processJob].func(...call_flow[setStatus.processJob].args);//Set InProcess

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(forfeit);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.InProcess);
    });

    it("Job status set InProcess by not worker: fail", async () => {
      //Assign job
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.assignJob + 1)) {
        await val.func(...val.args);
      }
      try {
        await work_quest.connect(employer).processJob(...call_flow[setStatus.processJob].args);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });

    it("Job status set InProcess from non Assigned or Rework statuses: fail", async () => {
      await call_flow[setStatus.publishJob].func(...call_flow[setStatus.publishJob].args);
      try {
        await call_flow[setStatus.processJob].func(...call_flow[setStatus.processJob].args);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }

      await call_flow[setStatus.assignJob].func(...call_flow[setStatus.assignJob].args); //Assign job

      for (let val of call_flow.slice(setStatus.processJob, setStatus.reworkJob + 1)) {
        await val.func(...val.args);
        try {
          await call_flow[setStatus.processJob].func(...call_flow[setStatus.processJob].args);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });
  });


  describe("Verification job", () => {
    it("Set verification status: success", async () => {
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.verificationJob + 1)) {
        await val.func(...val.args);
      }

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.Verification);
    });

    it("Job status set Verificatiion by not worker: fail", async () => {
      //Process job
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.processJob + 1)) {
        await val.func(...val.args);
      }
      try {
        await work_quest.connect(employer).verificationJob(...call_flow[setStatus.verificationJob].args);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });

    it("Job status set Verificatiion from non InProcess status: fail", async () => {
      //Assign job
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.assignJob + 1)) {
        await val.func(...val.args);
        try {
          await call_flow[setStatus.verificationJob].func(...call_flow[setStatus.verificationJob].args);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.processJob].func(...call_flow[setStatus.processJob].args); //Process job

      for (let val of call_flow.slice(setStatus.verificationJob)) {
        await val.func(...val.args);
        try {
          await call_flow[setStatus.verificationJob].func(...call_flow[setStatus.verificationJob].args);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });
  });


  describe("Decrease cost of job", () => {
    it("Decrease cost of job: success", async () => {
      //Decrease cost job
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.decreaseCostJob + 1)) {
        await val.func(...val.args);
      }

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(forfeit);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.DecreasedCost);
    });

    it("Decrease cost from not Verification or DecreasedCost statuses by employer: fail", async () => {
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.processJob + 1)) {
        await val.func(...val.args);
        try {
          await call_flow[setStatus.decreaseCostJob].func(...call_flow[setStatus.decreaseCostJob].args); //Decrease cost
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.verificationJob].func(...call_flow[setStatus.verificationJob].args); //Verification
      await call_flow[setStatus.decreaseCostJob].func(...call_flow[setStatus.decreaseCostJob].args); //Decrease cost

      for (let val of call_flow.slice(setStatus.arbitrationJob)) {
        await val.func(...val.args);
        try {
          await call_flow[setStatus.decreaseCostJob].func(...call_flow[setStatus.decreaseCostJob].args); //Decrease cost
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });

    it("Decrease cost from not Arbitration status by arbiter: fail", async () => {
      //from Publish to DecreaseCost
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.decreaseCostJob + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(arbiter).decreaseCostJob(...call_flow[setStatus.decreaseCostJob].args);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
      await call_flow[setStatus.arbitrationJob].func(...call_flow[setStatus.arbitrationJob].args); //Arbitration
      await call_flow[setStatus.reworkJob].func(...call_flow[setStatus.reworkJob].args); //Rework
      try {
        await work_quest.connect(arbiter).decreaseCostJob(...call_flow[setStatus.decreaseCostJob].args);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });
  });

  describe("Rework job", () => {
    it("Set job to rework: success", async () => {
      for (let val of call_flow) {
        await val.func(...val.args);
      }

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(forfeit);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.Rework);
    });

    it("Rework from not Verification status by employer: fail", async () => {
      //from Publish to InProcess
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.processJob + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).reworkJob(...call_flow[setStatus.reworkJob].args); //Rework
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.verificationJob].func(...call_flow[setStatus.verificationJob].args); //Verification

      for (let val of call_flow.slice(setStatus.decreaseCostJob)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).reworkJob(...call_flow[setStatus.reworkJob].args); //Rework
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });

    it("Rework from not Arbitration status by arbiter: fail", async () => {
      //from Publish to DecreasedCost
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.decreaseCostJob + 1)) {
        await val.func(...val.args);
        try {
          await call_flow[setStatus.reworkJob].func(...call_flow[setStatus.reworkJob].args); //Rework by arbiter
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.arbitrationJob].func(...call_flow[setStatus.arbitrationJob].args); //Arbitration
      await call_flow[setStatus.reworkJob].func(...call_flow[setStatus.reworkJob].args); //Rework

      try {
        await work_quest.connect(employer).reworkJob(...call_flow[setStatus.reworkJob].args); //Rework
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });
  });

  describe("Arbitration job", () => {
    it("Set job to arbitration: success", async () => {
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.arbitrationJob + 1)) {
        await val.func(...val.args);
      }

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(forfeit);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.Arbitration);
    });

    it("Set job to arbitration from not Verification status by employer: fail", async () => {
      //from Publish to Process
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.processJob + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.verificationJob].func(...call_flow[setStatus.verificationJob].args); //Verification

      for (let val of call_flow.slice(setStatus.decreaseCostJob)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });

    it("Set job to arbitration from not Rework or DecreasedCost statuses by worker: fail", async () => {
      //from Publish to Verification
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.verificationJob + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(worker).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.decreaseCostJob].func(...call_flow[setStatus.decreaseCostJob].args); // DecreasedCost
      await work_quest.connect(worker).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration

      try {
        await work_quest.connect(worker).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }

      await call_flow[setStatus.reworkJob].func(...call_flow[setStatus.reworkJob].args); //Rework
      await work_quest.connect(worker).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration
    });

  });

  describe("Accept job", () => {
    it("Accept job by employer: success", async () => {
      //to Verification
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.verificationJob + 1)) {
        await val.func(...val.args);
      }
      expect(
        await web3.eth.getBalance(work_quest.address)
      ).to.be.equal(cost.toString());

      let feeReceiverBalance = await web3.eth.getBalance(feeReceiver.address);
      let workerBalance = await web3.eth.getBalance(worker.address);

      await work_quest.connect(employer).acceptJob();

      expect(
        await web3.eth.getBalance(feeReceiver.address) - feeReceiverBalance
      ).to.be.equal(double_comission.toString());

      expect(
        await web3.eth.getBalance(worker.address) - workerBalance
      ).to.be.equal(reward.toString());

      expect(
        await web3.eth.getBalance(work_quest.address)
      ).to.be.equal(0);

      let info = await work_quest.connect(employer).getInfo();
      expect(info[6]).to.be.equal(JobStatus.Accepted);

    });

    it("Accept job by worker after decrease cost: success", async () => {
      //Decrease cost
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.decreaseCostJob + 1)) {
        await val.func(...val.args);
      }

      // Contract balance before accept
      expect(
        await web3.eth.getBalance(work_quest.address)
      ).to.be.equal(cost.toString());

      let info = await work_quest.connect(employer).getInfo();
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(forfeit);

      let employerBalance = await web3.eth.getBalance(employer.address);
      let workerBalance = await web3.eth.getBalance(worker.address);
      let feeReceiverBalance = await web3.eth.getBalance(feeReceiver.address);

      await work_quest.connect(worker).acceptJob();

      expect(
        await web3.eth.getBalance(employer.address) - employerBalance
      ).to.equal(forfeit.toString());

      expect(
        await web3.eth.getBalance(feeReceiver.address) - feeReceiverBalance
      ).to.equal(double_comission_after_forfeit.toString());

      expect(
        await web3.eth.getBalance(worker.address) - workerBalance
      ).to.equal(reward_after_forfeit.toString());

      expect(
        await web3.eth.getBalance(work_quest.address)
      ).to.equal(0);

      expect(
        await work_quest.connect(employer).getJobStatus()
      ).to.equal(JobStatus.Accepted);

    });

    it("Accept job from not Verification status by employer: fail", async () => {
      //from Publish to InProcess
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.processJob + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).acceptJob();
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.verificationJob].func(...call_flow[setStatus.verificationJob].args); //Verification

      for (let val of call_flow.slice(setStatus.decreaseCostJob)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).acceptJob();
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });

    it("Accept job from not DecreasedCost status by worker: fail", async () => {
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.verificationJob + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(worker).acceptJob();
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.decreaseCostJob].func(...call_flow[setStatus.decreaseCostJob].args); //DecreasedCost

      for (let val of call_flow.slice(setStatus.arbitrationJob)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(worker).acceptJob();
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });

    it("Accept job from not Arbitration status by arbiter: fail", async () => {
      //from Publish to DecreasedCost
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.decreaseCostJob + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(arbiter).acceptJob();
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.arbitrationJob].func(...call_flow[setStatus.arbitrationJob].args); //Arbitration

      await call_flow[setStatus.reworkJob].func(...call_flow[setStatus.reworkJob].args); //Rework
      try {
        await work_quest.connect(arbiter).acceptJob();
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });
  });

  describe("Decline job", () => {
    it("Decline job: success", async () => {
      //set Verification
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.verificationJob + 1)) {
        await val.func(...val.args);
      }
      await work_quest.connect(employer).arbitrationJob();

      let employerBalance = await web3.eth.getBalance(employer.address);
      let feeReceiverBalance = await web3.eth.getBalance(feeReceiver.address)

      await work_quest.connect(arbiter).declineJob();

      expect(
        await web3.eth.getBalance(employer.address) - employerBalance
      ).to.be.equal(reward.toString());

      expect(
        await web3.eth.getBalance(feeReceiver.address) - feeReceiverBalance
      ).to.be.equal(double_comission.toString());

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      // expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.Declined);
    });

    it("Decline job from non Arbitration status by arbiter: fail", async () => {
      //from Publish to DecreasedCost
      for (let val of call_flow.slice(setStatus.publishJob, setStatus.decreaseCostJob + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(arbiter).declineJob();
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.arbitrationJob].func(...call_flow[setStatus.arbitrationJob].args); //Arbitration

      await call_flow[setStatus.reworkJob].func(...call_flow[setStatus.reworkJob].args); //Rework
      try {
        await work_quest.connect(arbiter).declineJob();
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });
  });
});