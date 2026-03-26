const {UserWallet, UserSigner} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-wallet');
const {Transaction, TransactionComputer, Address} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-core');
const fs = require('fs');

const GATEWAY = 'https://gateway.battleofnodes.com';
const GL = 'erd10xsxzsaevkv70ysuxlakv7ctku8x4q0l6eqfpfellcpefxenx0kqlzsp8d';
const GL_PASSWORD = '@221182Tommy';
const AMOUNT = BigInt('5000000000000000000');

const json = JSON.parse(fs.readFileSync('/root/agents/wallets/gl-wallet.json', 'utf8'));
const mnemonic = UserWallet.decryptMnemonic(json, GL_PASSWORD);
const sk = mnemonic.deriveKey(0);
const signer = new UserSigner(sk);
const tc = new TransactionComputer();
const wallets = JSON.parse(fs.readFileSync('/root/agents/bon/challenge4/wallets-c4.json', 'utf8'));

(async () => {
  const d = await fetch(GATEWAY + '/address/' + GL).then(r => r.json());
  let nonce = d?.data?.account?.nonce || 0;
  console.log('GL Nonce:', nonce, 'Funding', wallets.length, 'wallets');

  for (const w of wallets) {
    const tx = new Transaction({
      sender: new Address(GL),
      receiver: new Address(w.address),
      value: AMOUNT,
      gasLimit: 50000n,
      gasPrice: 1000000000n,
      nonce: BigInt(nonce),
      chainID: 'B',
      version: 1
    });
    const sig = await signer.sign(tc.computeBytesForSigning(tx));
    tx.signature = sig;
    const res = await fetch(GATEWAY + '/transaction/send', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(tx.toSendable())
    }).then(r => r.json());

    if (res.data?.txHash) {
      console.log('Funded Shard', w.shard, w.address, '| TX:', res.data.txHash);
      nonce++;
    } else {
      console.log('FAILED:', w.address, JSON.stringify(res));
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('DONE');
})();
