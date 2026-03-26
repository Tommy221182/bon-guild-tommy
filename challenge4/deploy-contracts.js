const {UserSecretKey, UserSigner} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-wallet');
const {Transaction, TransactionComputer, Address} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-core');
const fs = require('fs');

const GATEWAY = 'https://gateway.battleofnodes.com';
const wallets = JSON.parse(fs.readFileSync('/root/agents/bon/challenge4/wallets-c4.json', 'utf8'));
const wasmHex = fs.readFileSync('/root/agents/bon/challenge4/forwarder-blind-bon.wasm').toString('hex');
const tc = new TransactionComputer();

// Deploy data: wasmCode@0500@0506 (vmType=0500, upgrade=0506 means upgradeable)
const deployData = wasmHex + '@0500@0506';

(async () => {
  const contracts = [];

  for (const w of wallets) {
    const sk = UserSecretKey.fromString(w.privateKeyHex);
    const signer = new UserSigner(sk);

    const d = await fetch(GATEWAY + '/address/' + w.address).then(r => r.json());
    const nonce = d?.data?.account?.nonce || 0;
    console.log('Deploying from Shard', w.shard, w.address, 'nonce:', nonce);

    const tx = new Transaction({
      sender: new Address(w.address),
      receiver: new Address('erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu'),
      value: 0n,
      gasLimit: 50000000n,
      gasPrice: 1000000000n,
      nonce: BigInt(nonce),
      chainID: 'B',
      version: 1,
      data: Buffer.from(deployData)
    });

    const sig = await signer.sign(tc.computeBytesForSigning(tx));
    tx.signature = sig;

    const res = await fetch(GATEWAY + '/transaction/send', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(tx.toSendable())
    }).then(r => r.json());

    if (res.data?.txHash) {
      console.log('Deploy TX Shard', w.shard, ':', res.data.txHash);
      contracts.push({ shard: w.shard, deployerAddress: w.address, txHash: res.data.txHash });
    } else {
      console.log('FAILED Shard', w.shard, ':', JSON.stringify(res));
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  fs.writeFileSync('/root/agents/bon/challenge4/contracts.json', JSON.stringify(contracts, null, 2));
  console.log('Saved contracts.json — wait ~6 seconds then check contract addresses');
})();
