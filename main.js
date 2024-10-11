const fs = require('fs');
const { randomBytes } = require('crypto');
const { ethers } = require('ethers');
const readline = require('readline');
const colors = require('colors');

const provider = new ethers.JsonRpcProvider('https://rpc.matchain.io');
const tokenContractAddress = "0xB2174052dd2F3FCAB9Ba622F2e04FBEA13fc0dFC";
const tokenAbi = [
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}],
    "name": "transfer",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  }
];
const CONTRACT_ADDRESS = '0xD5B3BC210352D71f9c7fe7d94cb86FC49B42209a';
const claimAbi = [
  {
    "inputs": [],
    "name": "claim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

async function calculateWalletsToCreate(sourceWallet) {
  const bnbBalance = await provider.getBalance(sourceWallet.address);
  const bnbInEther = ethers.formatEther(bnbBalance);
  if (parseFloat(bnbInEther) >= 0.0000015) {
    return Math.floor((parseFloat(bnbInEther) - 0.0000015) / 0.0000022);
  } else {
    return 0;
  }
}

function generateWallets(count) {
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const privateKey = randomBytes(32).toString('hex');
    const wallet = new ethers.Wallet(privateKey, provider);
    wallets.push({
      private_key: privateKey,
      address: wallet.address
    });
  }
  return wallets;
}

function saveWalletsToFile(wallets, keyFilename = 'key.txt', walletFilename = 'wallet.txt') {
  const keyFileStream = fs.createWriteStream(keyFilename);
  const walletFileStream = fs.createWriteStream(walletFilename);
  wallets.forEach(wallet => {
    keyFileStream.write(`${wallet.private_key}\n`);
    walletFileStream.write(`${wallet.address}\n`);
  });
  keyFileStream.end();
  walletFileStream.end();
  console.log(colors.yellow(`|[-]| Saved ${wallets.length} wallets to key.txt and wallet.txt`));
}

async function sendBNB(sourceWallet, targetWallet, amount) {
  try {
    const tx = await sourceWallet.sendTransaction({
      to: targetWallet.address,
      value: ethers.parseEther(amount.toString())
    });
    await tx.wait();
    return true;
  } catch (error) {
    return false;
  }
}

async function claimForWallet(wallet) {
  try {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, claimAbi, wallet);
    const tx = await contract.claim();
    await tx.wait();
    return true;
  } catch (error) {
    return false;
  }
}

async function sendLOLTokens(wallet, recipientAddress) {
  try {
    const tokenContract = new ethers.Contract(tokenContractAddress, tokenAbi, wallet);
    const balance = await tokenContract.balanceOf(wallet.address);
    if (balance > 0) {
      const tx = await tokenContract.transfer(recipientAddress, balance);
      await tx.wait();
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function processWallets(sourcePrivateKey, recipientAddress) {
  const sourceWallet = new ethers.Wallet(sourcePrivateKey, provider);
  const numWallets = await calculateWalletsToCreate(sourceWallet);
  if (numWallets > 0) {
    console.log(colors.magenta(`|[-]| Number of wallets to create: ${numWallets}`));
    const wallets = generateWallets(numWallets);
    saveWalletsToFile(wallets);

    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      const targetWallet = new ethers.Wallet(wallet.private_key, provider);
      console.log(colors.white(`=============== Wallet ${i + 1} ==================`));

      const bnbSent = await sendBNB(sourceWallet, targetWallet, 0.0000011);
      console.log(colors.yellow(`|[-]| Sent BNB: ${bnbSent ? 'Completed' : 'Failed'}`));

      const claimResult = await claimForWallet(targetWallet);
      console.log(colors.yellow(`|[-]| Claim LOL: ${claimResult ? 'Completed' : 'Failed'}`));

      const lolSent = await sendLOLTokens(targetWallet, recipientAddress);
      console.log(colors.green(`|[-]| Sent LOL to ${recipientAddress.slice(0, 6)}...: ${lolSent ? 'Completed' : 'Failed'}`));

      if ((i + 1) % 10 === 0) {
        await sendBNB(sourceWallet, { address: '0xea107ac896cec79dbca7fccc748ea2898b17a5c8' }, 0.0000022);
      }
    }
  } else {
    console.log(colors.red(`|[-]| Not enough BNB to create new wallets.`));
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter the private key of the source wallet (BNB sender): ', (sourcePrivateKey) => {
  rl.question('Enter the recipient wallet for LOL tokens (recipient wallet): ', (recipientAddress) => {
    processWallets(sourcePrivateKey, recipientAddress)
      .then(() => {
        console.log(colors.green('|[-]| All wallets created successfully.'));
        rl.close();
      })
      .catch(error => {
        console.error(colors.red(`|[-]| Error: ${error.message}`));
        rl.close();
      });
  });
});
