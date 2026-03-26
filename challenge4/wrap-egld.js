const {UserSecretKey, UserSigner} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-wallet');
const {Transaction, TransactionComputer, Address} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-core');
const fs = require('fs');

const GATEWAY = 'https://gateway.battleofnodes.com';
const WRAP_CONTRACTS = {
  0: 'erd1qqqqqqqqqqqqqpgqvc7gdl0p4s97guh498wgz75k8sav6sjfjlwqh679jy',
  1: 'erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3',
  2: 'erd1qqqqqqqqqqqqqpgqmuk0q2saj0mgutxm4teywre6dl8wqf58xamqdrukln'
};
const WRAP_AMOUNT = BigInt('3000000000000000000'); // 3 EGLD
const wallets = JSON.parse(fs.readFileSync('/root/agents/bon/challenge4/wallets-c4.json', 'utf8'));
const tc = new TransactionComputer();

(async () => {
  for (const w of wallets) {
    const sk = UserSecretKey.fromString(w.privateKeyHex);
    const signer = new UserSigner(sk);
    const d = await fetch(GATEWAY + '/address/' + w.address).then(r => r.json());
    const nonce = d?.data?.account?.nonce || 0;
    const wrapContract = WRAP_CONTRACTS[w.shard];

    const tx = new Transaction({
      sender: new Address(w.address),
      receiver: new Address(wrapContract),
      value: WRAP_AMOUNT,
      gasLimit: 5000000n,
      gasPrice: 1000000000n,
      nonce: BigInt(nonce),
      chainID: 'B',
      version: 1,
      data: Buffer.from('wrapEgld')
    });

    const sig = await signer.sign(tc.computeBytesForSigning(tx));
    tx.signature = sig;
    const res = await fetch(GATEWAY + '/transaction/send', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(tx.toSendable())
    }).then(r => r.json());

    if (res.data?.txHash) {
      console.log('Wrapped Shard', w.shard, '| TX:', res.data.txHash);
    } else {
      console.log('FAILED Shard', w.shard, ':', JSON.stringify(res));
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('DONE - wait 10s then check WEGLD balances');
})();
