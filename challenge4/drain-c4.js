const {UserSecretKey, UserSigner} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-wallet');
const {Transaction, TransactionComputer, Address} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-core');
const fs = require('fs');

const GATEWAY = 'https://gateway.battleofnodes.com';
const USDC = 'USDC-c76f1f';
const WEGLD = 'WEGLD-bd4d79';
const wallets = JSON.parse(fs.readFileSync('/root/agents/bon/challenge4/wallets-c4.json', 'utf8'));
const contracts = JSON.parse(fs.readFileSync('/root/agents/bon/challenge4/contracts.json', 'utf8'));
const tc = new TransactionComputer();

(async () => {
  for (const c of contracts) {
    const w = wallets.find(w => w.shard === c.shard);
    const sk = UserSecretKey.fromString(w.privateKeyHex);
    const signer = new UserSigner(sk);
    const d = await fetch(GATEWAY + '/address/' + w.address).then(r => r.json());
    let nonce = d?.data?.account?.nonce || 0;

    for (const token of [USDC, WEGLD]) {
      const data = 'drain@' + Buffer.from(token).toString('hex') + '@';
      const tx = new Transaction({
        sender: new Address(w.address),
        receiver: new Address(c.contractAddress),
        value: 0n,
        gasLimit: 10000000n,
        gasPrice: 1000000000n,
        nonce: BigInt(nonce++),
        chainID: 'B',
        version: 1,
        data: Buffer.from(data)
      });
      const sig = await signer.sign(tc.computeBytesForSigning(tx));
      tx.signature = sig;
      const res = await fetch(GATEWAY + '/transaction/send', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(tx.toSendable())
      }).then(r => r.json());
      console.log('Drain', token, 'Shard', c.shard, ':', res.data?.txHash || JSON.stringify(res));
      await new Promise(r => setTimeout(r, 500));
    }
  }
  console.log('DONE');
})().catch(console.error);
