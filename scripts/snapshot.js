const fs = require("fs");
const { ethers } = require("ethers");
const provider = new ethers.providers.JsonRpcProvider("https://bsc-dataseed.binance.org/");

// const hackBlockNumber = 27457195
// const exchange1StopBlockNumber = 27464657
async function getSenderBalances(transactions) {
    const senderBalances = {};
  
    for (const tx of transactions) {
      const sender = tx.from;
  
      if (!senderBalances[sender]) {
        const balance = await provider.getBalance(sender);
        senderBalances[sender] = ethers.utils.formatUnits(balance, 18);
      }
    }
  
    return senderBalances;
  }
  
  async function createSnapshot(blockNumbers) {
    for (const blockNumber of blockNumbers) {
      try {
        const block = await provider.getBlockWithTransactions(blockNumber);
        const senderBalances = await getSenderBalances(block.transactions);
        
  
        const fileName = `block-${blockNumber}_senders_snapshot.json`;
        fs.writeFileSync(fileName, JSON.stringify(senderBalances, null, 2));
        console.log(`Snapshot for block ${blockNumber} saved as ${fileName}`);
      } catch (error) {
        console.error(`Error fetching block ${blockNumber}:`, error);
      }
    }
  }

(async () => {
    await createSnapshot([27470899])
})();