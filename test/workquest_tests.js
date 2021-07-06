const Web3 = require("web3");
const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'));
const { expect, assert } = require("chai");
const { ethers, waffle } = require("hardhat");
require("@nomiclabs/hardhat-waffle");
const { parseEther, solidityKeccak256 } = require("ethers/utils");
//ethers.provider.send("evm_setNextBlockTimestamp", [time + 10000]);

const nullstr = "0x0000000000000000000000000000000000000000"
const job_id = 1;
const job_hash = web3.utils.keccak256("string");
const cost = parseEther("1000");
const comission = parseEther("10");
const cost_comission = parseEther("1010");
const reward = parseEther("990");
const duble_comission = parseEther("20");
const forfeit = parseEther("100");
const cost_after_forfeit = parseEther("900");
const reward_after_forfeit = parseEther("891");
const comission_after_forfeit = parseEther("9");
const duble_comission_after_forfeit = parseEther("19");
const acces_denied_err = "WorkLabor: Access denied or invalid status"
const job_hash = soliditySha3("JOBHASH");


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
  newJob: 0,
  publishJob: 1,
  assignJob: 2,
  processJob: 3,
  verificationJob: 4,
  decreaseCostJob: 5,
  arbitrationJob: 6,
  reworkJob: 7,
});

let work_quest_owner;
let employer;
let worker;
let arbiter;
let feeReceiver;

let provider = ethers.getDefaultProvider();

ethers.getSigners().then(val => {
  [work_quest_owner, employer, worker, arbiter, feeReceiver] = val;
});

describe("Work Quest contract", () => {
  let work_labor;
  let call_flow;

  beforeEach(async () => {
    require('dotenv').config();

    const PensionFund = await hre.ethers.getContractFactory("PensionFund");
    const pension_fund = await PensionFund.deploy();
    await pension_fund.deployed();

    const WorkQuestFactory = await hre.ethers.getContractFactory("WorkQuestFactory");
    const work_quest_factory = await WorkQuestFactory.deploy(process.env.WORKQUEST_FEE, feeReceiver.address, pension_fund.address);
    await work_quest_factory.deployed();
    await work_quest_factory.connect(worker).newWorkQuest(job_hash, cost);
    let work_quest_address = await work_quest_factory.getWorkQuests(worker.address)[0];

    const work_quest = await hre.ethers.getContractAt("WorkQuestFactory", work_quest_address);



    call_flow = [
      { func: work_labor.connect(employer).newJob, args: [job_id, , cost] },
      { func: web3.eth.sendTransaction, args: [{ from: employer.address, to: work_quest.address, value: cost_comission }] },
      { func: work_labor.connect(employer).assignJob, args: [job_id, worker.address] },
      { func: work_labor.connect(worker).processJob, args: [job_id] },
      { func: work_labor.connect(worker).verificationJob, args: [job_id] },
      { func: work_labor.connect(employer).decreaseCostJob, args: [job_id, forfeit] },
      { func: work_labor.connect(worker).arbitrationJob, args: [job_id] },
      { func: work_labor.connect(arbiter).reworkJob, args: [job_id] }
    ]
  });


  describe("Deployment", () => {
    it("Should set the admin roles to creator and fee", async () => {
      var default_admin_role = await work_labor.DEFAULT_ADMIN_ROLE();
      var admin_role = await work_labor.ADMIN_ROLE();
      expect(
        await work_labor.connect(work_quest_owner).hasRole(default_admin_role, work_quest_owner.address)
      ).to.equal(true);
      expect(
        await work_labor.connect(work_quest_owner).hasRole(admin_role, work_quest_owner.address)
      ).to.equal(true);
      expect(
        await work_labor.connect(work_quest_owner).fee()
      ).to.equal(process.env.WORKLABOR_FEE);
      expect(
        await work_labor.connect(work_quest_owner).feeReceiver()
      ).to.equal(feeReceiver.address);
    });
  });


  describe("New job", () => {
    it("Create new job: success", async () => {
      //New job
      await call_flow[setStatus.newJob].func(...call_flow[setStatus.newJob].args);

      expect(
        await work_labor.connect(employer).getJobStatus(job_id)
      ).to.be.equal(JobStatus.New);

      [cost_, forfeit_] = await work_labor.connect(employer).getJobCostForfeit(job_id);
      expect(cost_).to.be.equal(cost);
      expect(forfeit_).to.be.equal(0);

      expect(
        await work_labor.connect(employer).getJobHash(job_id)
      ).to.be.equal(job_hash);

      [employer_, worker_] = await work_labor.connect(employer).getMemberAddresses(job_id)
      expect(employer_).to.be.equal(employer.address);
      expect(worker_).to.be.equal(nullstr);
    });
  });

  describe("Publish job", () => {
    it("Publish job: success", async () => {

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
      for (let val of call_flow.slice(setStatus.newJob, setStatus.assignJob + 1)) {
        await val.func(...val.args);
      }

      expect(
        await work_labor.connect(employer).getJobStatus(job_id)
      ).to.be.equal(JobStatus.Assigned);

      [cost_, forfeit_, currency_] = await work_labor.connect(employer).getJobCostForfeit(job_id);
      expect(cost_).to.be.equal(cost);
      expect(forfeit_).to.be.equal(0);

      expect(
        await work_labor.connect(employer).getJobHash(job_id)
      ).to.be.equal(job_hash);

      [employer_, worker_] = await work_labor.connect(employer).getMemberAddresses(job_id)
      expect(employer_).to.be.equal(employer.address);
      expect(worker_).to.be.equal(worker.address);
    });

    it("Assigning worker to job from not employer: fail", async () => {
      //Publish job
      await call_flow[setStatus.newJob].func(...call_flow[setStatus.newJob].args);
      try {
        await work_labor.connect(worker).assignJob(...call_flow[setStatus.assignJob].args);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });

    it("Assigning invalid worker: fail", async () => {
      //Publish job
      await call_flow[setStatus.newJob].func(...call_flow[setStatus.newJob].args);
      try {
        await work_labor.connect(employer).assignJob(job_id, nullstr);
      } catch (e) {
        await expect(e.message).to.include('WorkLabor: Invalid address');
      }
    });

    it("Assign job from non Public statuses: fail", async () => {
      try {
        await work_labor.connect(employer).assignJob(...call_flow[setStatus.assignJob].args);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }

      await call_flow[setStatus.newJob].func(...call_flow[setStatus.newJob].args); //Publish job

      for (let val of call_flow.slice(setStatus.assignJob)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(employer).assignJob(...call_flow[setStatus.assignJob].args);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });
  });


  describe("Process job", () => {
    it("Job status set InProcess from Assigned: success", async () => {
      //Set InProcess job
      for (let val of call_flow.slice(setStatus.newJob, setStatus.processJob + 1)) {
        await val.func(...val.args);
      }

      expect(
        await work_labor.connect(employer).getJobStatus(job_id)
      ).to.be.equal(JobStatus.InProcess);

      [cost_, forfeit_, currency_] = await work_labor.connect(employer).getJobCostForfeit(job_id);
      expect(cost_).to.be.equal(cost);
      expect(forfeit_).to.be.equal(0);

      expect(
        await work_labor.connect(employer).getJobHash(job_id)
      ).to.be.equal(job_hash);

      [employer_, worker_] = await work_labor.connect(employer).getMemberAddresses(job_id)
      expect(employer_).to.be.equal(employer.address);
      expect(worker_).to.be.equal(worker.address);
    });

    it("Job status set InProcess from Rework: success", async () => {
      //Set Rework status
      for (let val of call_flow) {
        await val.func(...val.args);
      }

      await call_flow[setStatus.processJob].func(...call_flow[setStatus.processJob].args);//Set InProcess

      expect(
        await work_labor.connect(employer).getJobStatus(job_id)
      ).to.be.equal(JobStatus.InProcess);

      [cost_, forfeit_, currency_] = await work_labor.connect(employer).getJobCostForfeit(job_id);
      expect(cost_).to.be.equal(cost);
      expect(forfeit_).to.be.equal(forfeit);

      expect(
        await work_labor.connect(employer).getJobHash(job_id)
      ).to.be.equal(job_hash);

      [employer_, worker_] = await work_labor.connect(employer).getMemberAddresses(job_id)
      expect(employer_).to.be.equal(employer.address);
      expect(worker_).to.be.equal(worker.address);
    });

    it("Job status set InProcess by not worker: fail", async () => {
      //Assign job
      for (let val of call_flow.slice(setStatus.newJob, setStatus.assignJob + 1)) {
        await val.func(...val.args);
      }
      try {
        await work_labor.connect(employer).processJob(...call_flow[setStatus.processJob].args);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });

    it("Job status set InProcess from non Assigned or Rework statuses: fail", async () => {
      await call_flow[setStatus.newJob].func(...call_flow[setStatus.newJob].args);
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
      for (let val of call_flow.slice(setStatus.newJob, setStatus.verificationJob + 1)) {
        await val.func(...val.args);
      }

      expect(
        await work_labor.connect(employer).getJobStatus(job_id)
      ).to.be.equal(JobStatus.Verification);

      [cost_, forfeit_, currency_] = await work_labor.connect(employer).getJobCostForfeit(job_id);
      expect(cost_).to.be.equal(cost);
      expect(forfeit_).to.be.equal(0);

      expect(
        await work_labor.connect(employer).getJobHash(job_id)
      ).to.be.equal(job_hash);

      [employer_, worker_] = await work_labor.connect(employer).getMemberAddresses(job_id)
      expect(employer_).to.be.equal(employer.address);
      expect(worker_).to.be.equal(worker.address);
    });

    it("Job status set Verificatiion by not worker: fail", async () => {
      //Process job
      for (let val of call_flow.slice(setStatus.newJob, setStatus.processJob + 1)) {
        await val.func(...val.args);
      }
      try {
        await work_labor.connect(employer).verificationJob(...call_flow[setStatus.verificationJob].args);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });

    it("Job status set Verificatiion from non InProcess status: fail", async () => {
      //Assign job
      for (let val of call_flow.slice(setStatus.newJob, setStatus.assignJob + 1)) {
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
      for (let val of call_flow.slice(setStatus.newJob, setStatus.decreaseCostJob + 1)) {
        await val.func(...val.args);
      }

      expect(
        await work_labor.connect(employer).getJobStatus(job_id)
      ).to.be.equal(JobStatus.DecreasedCost);

      [cost_, forfeit_, currency_] = await work_labor.connect(employer).getJobCostForfeit(job_id);
      expect(cost_).to.be.equal(cost);
      expect(forfeit_).to.be.equal(forfeit);

      expect(
        await work_labor.connect(employer).getJobHash(job_id)
      ).to.be.equal(job_hash);

      [employer_, worker_] = await work_labor.connect(employer).getMemberAddresses(job_id)
      expect(employer_).to.be.equal(employer.address);
      expect(worker_).to.be.equal(worker.address);
    });

    it("Decrease cost from not Verification or DecreasedCost statuses by employer: fail", async () => {
      for (let val of call_flow.slice(setStatus.newJob, setStatus.processJob + 1)) {
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
      for (let val of call_flow.slice(setStatus.newJob, setStatus.decreaseCostJob + 1)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(arbiter).decreaseCostJob(...call_flow[setStatus.decreaseCostJob].args);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
      await call_flow[setStatus.arbitrationJob].func(...call_flow[setStatus.arbitrationJob].args); //Arbitration
      await call_flow[setStatus.reworkJob].func(...call_flow[setStatus.reworkJob].args); //Rework
      try {
        await work_labor.connect(arbiter).decreaseCostJob(...call_flow[setStatus.decreaseCostJob].args);
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

      expect(
        await work_labor.connect(employer).getJobStatus(job_id)
      ).to.be.equal(JobStatus.Rework);

      [cost_, forfeit_, currency_] = await work_labor.connect(employer).getJobCostForfeit(job_id);
      expect(cost_).to.be.equal(cost);
      expect(forfeit_).to.be.equal(forfeit);

      expect(
        await work_labor.connect(employer).getJobHash(job_id)
      ).to.be.equal(job_hash);

      [employer_, worker_] = await work_labor.connect(employer).getMemberAddresses(job_id)
      expect(employer_).to.be.equal(employer.address);
      expect(worker_).to.be.equal(worker.address);
    });

    it("Rework from not Verification status by employer: fail", async () => {
      //from Publish to InProcess
      for (let val of call_flow.slice(setStatus.newJob, setStatus.processJob + 1)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(employer).reworkJob(...call_flow[setStatus.reworkJob].args); //Rework
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.verificationJob].func(...call_flow[setStatus.verificationJob].args); //Verification

      for (let val of call_flow.slice(setStatus.decreaseCostJob)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(employer).reworkJob(...call_flow[setStatus.reworkJob].args); //Rework
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });

    it("Rework from not Arbitration status by arbiter: fail", async () => {
      //from Publish to DecreasedCost
      for (let val of call_flow.slice(setStatus.newJob, setStatus.decreaseCostJob + 1)) {
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
        await work_labor.connect(employer).reworkJob(...call_flow[setStatus.reworkJob].args); //Rework
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });
  });

  describe("Arbitration job", () => {
    it("Set job to arbitration: success", async () => {
      for (let val of call_flow.slice(setStatus.newJob, setStatus.arbitrationJob + 1)) {
        await val.func(...val.args);
      }

      expect(
        await work_labor.connect(employer).getJobStatus(job_id)
      ).to.be.equal(JobStatus.Arbitration);

      [cost_, forfeit_, currency_] = await work_labor.connect(employer).getJobCostForfeit(job_id);
      expect(cost_).to.be.equal(cost);
      expect(forfeit_).to.be.equal(forfeit);

      expect(
        await work_labor.connect(employer).getJobHash(job_id)
      ).to.be.equal(job_hash);

      [employer_, worker_] = await work_labor.connect(employer).getMemberAddresses(job_id)
      expect(employer_).to.be.equal(employer.address);
      expect(worker_).to.be.equal(worker.address);
    });

    it("Set job to arbitration from not Verification status by employer: fail", async () => {
      //from Publish to Process
      for (let val of call_flow.slice(setStatus.newJob, setStatus.processJob + 1)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(employer).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.verificationJob].func(...call_flow[setStatus.verificationJob].args); //Verification

      for (let val of call_flow.slice(setStatus.decreaseCostJob)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(employer).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });

    it("Set job to arbitration from not Rework or DecreasedCost statuses by worker: fail", async () => {
      //from Publish to Verification
      for (let val of call_flow.slice(setStatus.newJob, setStatus.verificationJob + 1)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(worker).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.decreaseCostJob].func(...call_flow[setStatus.decreaseCostJob].args); // DecreasedCost
      await work_labor.connect(worker).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration

      try {
        await work_labor.connect(worker).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }

      await call_flow[setStatus.reworkJob].func(...call_flow[setStatus.reworkJob].args); //Rework
      await work_labor.connect(worker).arbitrationJob(...call_flow[setStatus.arbitrationJob].args); //Arbitration
    });

  });

  describe("Accept job", () => {
    it("Accept job by employer: success", async () => {
      //to Verification
      for (let val of call_flow.slice(setStatus.newJob, setStatus.verificationJob + 1)) {
        await val.func(...val.args);
      }
      expect(
        await provider.getBalance(work_labor.address)
      ).to.be.equal(cost);

      await work_labor.connect(employer).acceptJob(job_id);

      expect(
        await provider.getBalance(feeReceiver.address)
      ).to.be.equal(duble_comission);

      expect(
        await provider.getBalance(worker.address)
      ).to.be.equal(reward);

      expect(
        await provider.getBalance(work_labor.address)
      ).to.be.equal(0);

      expect(
        await work_labor.connect(employer).getJobStatus(job_id)
      ).to.be.equal(JobStatus.Accepted);

    });

    it("Accept job by worker after decrease cost: success", async () => {
      //Decrease cost
      for (let val of call_flow.slice(setStatus.newJob, setStatus.decreaseCostJob + 1)) {
        await val.func(...val.args);
      }

      // Contract balance before accept
      expect(
        await provider.getBalance(work_labor.address)
      ).to.be.equal(cost);

      [cost_, forfeit_, currency_] = await work_labor.connect(employer).getJobCostForfeit(job_id);
      expect(cost_).to.be.equal(cost);
      expect(forfeit_).to.be.equal(forfeit);

      await work_labor.connect(worker).acceptJob(job_id);

      expect(
        await provider.getBalance(employer.address)
      ).to.be.equal(forfeit);

      expect(
        await provider.getBalance(feeReceiver.address)
      ).to.be.equal(duble_comission_after_forfeit);

      expect(
        await provider.getBalance(worker.address)
      ).to.be.equal(reward_after_forfeit);

      expect(
        await provider.getBalance(work_labor.address)
      ).to.be.equal(0);

      expect(
        await work_labor.connect(employer).getJobStatus(job_id)
      ).to.be.equal(JobStatus.Accepted);

    });

    it("Accept job from not Verification status by employer: fail", async () => {
      //from Publish to InProcess
      for (let val of call_flow.slice(setStatus.newJob, setStatus.processJob + 1)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(employer).acceptJob(job_id);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.verificationJob].func(...call_flow[setStatus.verificationJob].args); //Verification

      for (let val of call_flow.slice(setStatus.decreaseCostJob)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(employer).acceptJob(job_id);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });

    it("Accept job from not DecreasedCost status by worker: fail", async () => {
      for (let val of call_flow.slice(setStatus.newJob, setStatus.verificationJob + 1)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(worker).acceptJob(job_id);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.decreaseCostJob].func(...call_flow[setStatus.decreaseCostJob].args); //DecreasedCost

      for (let val of call_flow.slice(setStatus.arbitrationJob)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(worker).acceptJob(job_id);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });

    it("Accept job from not Arbitration status by arbiter: fail", async () => {
      //from Publish to DecreasedCost
      for (let val of call_flow.slice(setStatus.newJob, setStatus.decreaseCostJob + 1)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(arbiter).acceptJob(job_id);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.arbitrationJob].func(...call_flow[setStatus.arbitrationJob].args); //Arbitration

      await call_flow[setStatus.reworkJob].func(...call_flow[setStatus.reworkJob].args); //Rework
      try {
        await work_labor.connect(arbiter).acceptJob(job_id);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });
  });

  describe("Decline job", () => {
    it("Decline job: success", async () => {
      //set Verification
      for (let val of call_flow.slice(setStatus.newJob, setStatus.verificationJob + 1)) {
        await val.func(...val.args);
      }
      await work_labor.connect(employer).arbitrationJob(job_id);
      await work_labor.connect(arbiter).declineJob(job_id);

      expect(
        await provider.getBalance(employer.address)
      ).to.be.equal(reward);

      expect(
        await provider.getBalance(feeReceiver.address)
      ).to.be.equal(duble_comission);

      expect(
        await work_labor.connect(employer).getJobStatus(job_id)
      ).to.be.equal(JobStatus.Declined);
    });

    it("Decline job from non Arbitration status by arbiter: fail", async () => {
      //from Publish to DecreasedCost
      for (let val of call_flow.slice(setStatus.newJob, setStatus.decreaseCostJob + 1)) {
        await val.func(...val.args);
        try {
          await work_labor.connect(arbiter).declineJob(job_id);
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await call_flow[setStatus.arbitrationJob].func(...call_flow[setStatus.arbitrationJob].args); //Arbitration

      await call_flow[setStatus.reworkJob].func(...call_flow[setStatus.reworkJob].args); //Rework
      try {
        await work_labor.connect(arbiter).declineJob(job_id);
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });
  });
});