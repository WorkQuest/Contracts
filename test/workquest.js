const Web3 = require("web3");
const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'));
const { expect } = require("chai");
const { ethers } = require("hardhat");
require("@nomiclabs/hardhat-waffle");
const { parseEther } = require("ethers/lib/utils");

const nullstr = "0x0000000000000000000000000000000000000000"
const job_hash = web3.utils.keccak256("JOBHASH");
const cost = parseEther("1");
const comission = "9999999999934464";
const cost_comission = parseEther("1.01");
const reward = "990000000000065500";
const double_comission = parseEther("0.02");
const forfeit = parseEther("0.1");
const cost_after_forfeit = parseEther("0.9");
const reward_after_forfeit = parseEther("0.891");
const comission_after_forfeit = "8999999999967232";
const double_comission_after_forfeit = parseEther("0.019");
const acces_denied_err = "WorkQuest: Access denied or invalid status";
const WORKQUEST_FEE = "10000000000000000";

const JobStatus = Object.freeze({
  New: 0,
  Published: 1,
  WaitWorker: 2,
  WaitJobStart: 3,
  InProgress: 4,
  WaitJobVerify: 5,
  Arbitration: 6,
  Finished: 7
});

const setStatus = Object.freeze({
  Published: 0,
  WaitWorker: 1,
  WaitJobStart: 2,
  InProgress: 3,
  WaitJobVerify: 4,
  Arbitration: 5,
  Finished: 6
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
    const pension_fund = await PensionFund.deploy(60);
    await pension_fund.deployed();

    const WorkQuestFactory = await hre.ethers.getContractFactory("WorkQuestFactory");
    work_quest_factory = await WorkQuestFactory.deploy(WORKQUEST_FEE, feeReceiver.address, pension_fund.address);
    await work_quest_factory.deployed();

    await work_quest_factory.updateArbiter(arbiter.address, true);

    await work_quest_factory.connect(employer).newWorkQuest(job_hash, cost, 0);
    let work_quest_address = (await work_quest_factory.getWorkQuests(employer.address))[0];
    work_quest = await hre.ethers.getContractAt("WorkQuest", work_quest_address);

    call_flow = [
      { func: web3.eth.sendTransaction, args: [{ from: employer.address, to: work_quest.address, value: cost_comission }] },
      { func: work_quest.connect(employer).assignJob, args: [worker.address] },
      { func: work_quest.connect(worker).acceptJob, args: [] },
      { func: work_quest.connect(worker).processJob, args: [] },
      { func: work_quest.connect(worker).verificationJob, args: [] },
      { func: work_quest.connect(employer).arbitration, args: [] },
      { func: work_quest.connect(arbiter).arbitrationAcceptWork, args: [] }
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
      await call_flow[setStatus.Published].func(...call_flow[setStatus.Published].args);
      let info = await work_quest.connect(employer).getInfo();
      expect(info[6]).to.be.equal(JobStatus.Published);
    });

    it("Publish job from other statuses: fail", async () => {
      for (let val of call_flow) {
        await val.func(...val.args);
        try {
          await call_flow[setStatus.Published].func(...call_flow[setStatus.Published].args);
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });
  });

  describe("Assign worker to job", () => {
    it("Assigning job: success", async () => {
      //Assign job
      for (let val of call_flow.slice(setStatus.Published, setStatus.WaitWorker + 1)) {
        await val.func(...val.args);
      }

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[6]).to.be.equal(JobStatus.WaitWorker);
    });

    it("Assigning worker to job from not employer: fail", async () => {
      //Publish job
      await call_flow[setStatus.Published].func(...call_flow[setStatus.Published].args);
      try {
        await work_quest.connect(worker).assignJob(...call_flow[setStatus.WaitWorker].args);
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });

    it("Assigning invalid worker: fail", async () => {
      //Publish job
      await call_flow[setStatus.Published].func(...call_flow[setStatus.Published].args);
      try {
        await work_quest.connect(employer).assignJob(nullstr);
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include('WorkQuest: Invalid address');
      }
    });

    it("Assign job from non Public statuses: fail", async () => {
      try {
        await work_quest.connect(employer).assignJob(...call_flow[setStatus.WaitWorker].args);
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }

      await call_flow[setStatus.Published].func(...call_flow[setStatus.Published].args);

      for (let val of call_flow.slice(setStatus.WaitWorker)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).assignJob(...call_flow[setStatus.WaitWorker].args);
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });
  });

  describe("Worker accepted job", () => {
    it("Worker accepted job from status WaitWorker: success", async () => {
      for (let val of call_flow.slice(setStatus.Published, setStatus.WaitJobStart + 1)) {
        await val.func(...val.args);
      }
      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[6]).to.be.equal(JobStatus.WaitJobStart);
    });

    it("Worker accepted job from not WaitWorker status: fail", async () => {
      // New status
      try {
        await work_quest.connect(worker).acceptJob();
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }

      // Published
      await call_flow[setStatus.Published].func(...call_flow[setStatus.Published].args);
      try {
        await work_quest.connect(worker).acceptJob();
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
      // WaitWorker
      await call_flow[setStatus.WaitWorker].func(...call_flow[setStatus.WaitWorker].args);
      await work_quest.connect(worker).acceptJob();

      for (let val of call_flow.slice(setStatus.InProgress)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(worker).acceptJob();
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });
  });

  describe("Process job", () => {
    it("Job status set InProgress from WaitJobStart: success", async () => {
      //Set InProgress job
      for (let val of call_flow.slice(setStatus.Published, setStatus.InProgress + 1)) {
        await val.func(...val.args);
      }

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.InProgress);
    });

    it("Job status set InProgress by not worker: fail", async () => {
      //Assign job
      for (let val of call_flow.slice(setStatus.Published, setStatus.WaitJobStart + 1)) {
        await val.func(...val.args);
      }
      try {
        await work_quest.connect(employer).processJob(...call_flow[setStatus.InProgress].args);
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });

    it("Job status set InProgress from non WaitWorker: fail", async () => {
      await call_flow[setStatus.Published].func(...call_flow[setStatus.Published].args);
      try {
        await call_flow[setStatus.InProgress].func(...call_flow[setStatus.InProgress].args);
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }

      await call_flow[setStatus.WaitWorker].func(...call_flow[setStatus.WaitWorker].args); //Assign job

      for (let val of call_flow.slice(setStatus.InProgress, setStatus.reworkJob + 1)) {
        await val.func(...val.args);
        try {
          await call_flow[setStatus.InProgress].func(...call_flow[setStatus.InProgress].args);
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });
  });


  describe("WaitJobVerify job", () => {
    it("Set verification status: success", async () => {
      for (let val of call_flow.slice(setStatus.Published, setStatus.WaitJobVerify + 1)) {
        await val.func(...val.args);
      }

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.WaitJobVerify);
    });

    it("Job status set Verificatiion by not worker: fail", async () => {
      //Process job
      for (let val of call_flow.slice(setStatus.Published, setStatus.InProgress + 1)) {
        await val.func(...val.args);
      }
      try {
        await work_quest.connect(employer).verificationJob();
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });

    it("Job status set Verificatiion from non InProgress status: fail", async () => {
      //Assign job
      for (let val of call_flow.slice(setStatus.Published, setStatus.WaitJobStart + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(worker).verificationJob();
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await await work_quest.connect(worker).processJob();

      for (let val of call_flow.slice(setStatus.WaitJobVerify)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(worker).verificationJob();
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });
  });

  describe("Arbitration job", () => {
    it("Set job to arbitration: success", async () => {
      for (let val of call_flow.slice(setStatus.Published, setStatus.Arbitration + 1)) {
        await val.func(...val.args);
      }

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.Arbitration);
    });

    it("Set job to arbitration from not WaitJobVerify status by employer: fail", async () => {
      //from Publish to Process
      for (let val of call_flow.slice(setStatus.Published, setStatus.InProgress + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).arbitration(); //Arbitration
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await work_quest.connect(worker).verificationJob(); //WaitJobVerify

      for (let val of call_flow.slice(setStatus.Arbitration)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).arbitration(); //Arbitration
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });
  });

  describe("Rework job", () => {
    it("Set job to rework: success", async () => {
      for (let val of call_flow.slice(setStatus.Published, setStatus.Arbitration + 1)) {
        await val.func(...val.args);
      }
      await work_quest.connect(arbiter).arbitrationRework();

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.InProgress);
    });

    it("Rework from not Arbitration status: fail", async () => {
      //from Publish to InProgress
      for (let val of call_flow.slice(setStatus.Published, setStatus.WaitJobVerify + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(arbiter).arbitrationRework(); //Rework
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
      await work_quest.connect(employer).arbitration();
      await work_quest.connect(arbiter).arbitrationAcceptWork();
      try {
        await work_quest.connect(arbiter).arbitrationRework(); //Rework
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });
  });

  describe("Decrease cost of job", () => {
    it("Decrease cost of job: success", async () => {
      //Decrease cost job
      for (let val of call_flow.slice(setStatus.Published, setStatus.Arbitration + 1)) {
        await val.func(...val.args);
      }

      await work_quest.connect(arbiter).arbitrationDecreaseCost(forfeit);

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      expect(info[2]).to.be.equal(forfeit);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.Finished);
    });

    it("Decrease cost from not Arbitration status: fail", async () => {
      for (let val of call_flow.slice(setStatus.Published, setStatus.Arbitration)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(arbiter).arbitrationDecreaseCost(forfeit);
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
      for (let val of call_flow.slice(setStatus.Arbitration, setStatus.Finished + 1)) {
        await val.func(...val.args);
      }
      try {
        await work_quest.connect(arbiter).arbitrationDecreaseCost(forfeit);
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });
  });

  describe("Accept job", () => {
    it("Accept job by employer: success", async () => {
      //to WaitJobVerify
      for (let val of call_flow.slice(setStatus.Published, setStatus.WaitJobVerify + 1)) {
        await val.func(...val.args);
      }
      expect(
        (await web3.eth.getBalance(work_quest.address)).toString()
      ).to.be.equal(cost.toString());

      let feeReceiverBalance = await web3.eth.getBalance(feeReceiver.address);
      let workerBalance = await web3.eth.getBalance(worker.address);

      await work_quest.connect(employer).acceptJobResult();

      // FIXME: different values for ever test
      // expect(
      //   (await web3.eth.getBalance(feeReceiver.address) - feeReceiverBalance).toString()
      // ).to.be.equal('');
      // expect(
      //   (await web3.eth.getBalance(worker.address) - workerBalance).toString()
      // ).to.be.equal('');

      expect(
        await web3.eth.getBalance(work_quest.address)
      ).to.be.equal('0');

      let info = await work_quest.connect(employer).getInfo();
      expect(info[6]).to.be.equal(JobStatus.Finished);

    });

    it("Accept job by arbiter: success", async () => {
      // Contract balance before accept
      // expect(
      //   (await web3.eth.getBalance(work_quest.address)).toString()
      // ).to.be.equal(cost.toString());

      let info = await work_quest.connect(employer).getInfo();
      expect(info[1]).to.be.equal(cost);

      for (let val of call_flow.slice(setStatus.Published, setStatus.Finished + 1)) {
        await val.func(...val.args);
      }

      let employerBalance = await web3.eth.getBalance(employer.address);
      let workerBalance = await web3.eth.getBalance(worker.address);
      let feeReceiverBalance = await web3.eth.getBalance(feeReceiver.address);

      // expect(
      //   (await web3.eth.getBalance(employer.address) - employerBalance).toString()
      // ).to.equal(forfeit.toString());

      //FIXME: different values for ever test
      // expect(
      //   (await web3.eth.getBalance(feeReceiver.address) - feeReceiverBalance).toString()
      // ).to.equal("");
      // expect(
      //   (await web3.eth.getBalance(worker.address) - workerBalance).toString()
      // ).to.equal('');

      expect(
        await web3.eth.getBalance(work_quest.address)
      ).to.equal('0');

      info = await work_quest.connect(employer).getInfo();
      expect(info[6]).to.be.equal(JobStatus.Finished);

    });

    it("Accept job result from not WaitJobVerify status by employer: fail", async () => {
      //from Publish to InProgress
      for (let val of call_flow.slice(setStatus.Published, setStatus.InProgress + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).acceptJobResult();
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await work_quest.connect(worker).verificationJob(); //WaitJobVerify

      for (let val of call_flow.slice(setStatus.Arbitration)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(employer).acceptJobResult();
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }
    });

    it("Accept job from not Arbitration status by arbiter: fail", async () => {
      for (let val of call_flow.slice(setStatus.Published, setStatus.WaitJobVerify + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(arbiter).arbitrationAcceptWork();
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await work_quest.connect(employer).arbitration(); // Arbitration
      await work_quest.connect(arbiter).arbitrationAcceptWork(); // Finished
      try {
        await work_quest.connect(worker).arbitrationAcceptWork();
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });
  });

  describe("Reject job", () => {
    it("Reject job by arbiter: success", async () => {
      //set WaitJobVerify
      for (let val of call_flow.slice(setStatus.Published, setStatus.WaitJobVerify + 1)) {
        await val.func(...val.args);
      }
      await work_quest.connect(employer).arbitration();

      // let feeReceiverBalance = await web3.eth.getBalance(feeReceiver.address)

      await work_quest.connect(arbiter).arbitrationRejectWork();

      expect(
        await web3.eth.getBalance(work_quest.address)
      ).to.be.equal('0');

      // expect(
      //   await web3.eth.getBalance(feeReceiver.address) - feeReceiverBalance
      // ).to.be.equal('');

      let info = await work_quest.connect(employer).getInfo();
      expect(info[0]).to.be.equal(job_hash);
      expect(info[1]).to.be.equal(cost);
      // expect(info[2]).to.be.equal(0);
      expect(info[3]).to.be.equal(employer.address);
      expect(info[4]).to.be.equal(worker.address);
      expect(info[5]).to.be.equal(arbiter.address);
      expect(info[6]).to.be.equal(JobStatus.Finished);
    });

    it("Reject work from non Arbitration status: fail", async () => {
      //from Publish to DecreasedCost
      for (let val of call_flow.slice(setStatus.Published, setStatus.WaitJobVerify + 1)) {
        await val.func(...val.args);
        try {
          await work_quest.connect(arbiter).arbitrationRejectWork();
          throw new Error('Not reverted');
        } catch (e) {
          await expect(e.message).to.include(acces_denied_err);
        }
      }

      await work_quest.connect(employer).arbitration();; //Arbitration
      await work_quest.connect(arbiter).arbitrationAcceptWork(); //Finished

      try {
        await work_quest.connect(arbiter).arbitrationRejectWork();
        throw new Error('Not reverted');
      } catch (e) {
        await expect(e.message).to.include(acces_denied_err);
      }
    });
  });
});