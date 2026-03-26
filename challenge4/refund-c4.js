const {UserWallet, UserSigner, UserSecretKey} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-wallet');
const {Transaction, TransactionComputer, Address} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-core');
const fs = require('fs');

const GATEWAY = 'https://gateway.battleofnodes.com';
const GL = 'erd10xsxzsaevkv70ysuxlakv7ctku8x4q0l6eqfpfellcpefxenx0kqlzsp8d';
const GL_PASSWORD = '@221182Tommy';
const FUND_AMOUNT = BigInt('50000000000000000000');
const WRAP_AMOUNT = BigInt('40000000000000000000');

const WRAP_CONTRACTS = {
  0: 'erd1qqqqqqqqqqqqqpgqvc7gdl0p4s97guh498wgz75k8sav6sjfjlwqh679jy',
  1: 'erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3',
  2: 'erd1qqqqqqqqqqqqqpgqmuk0q2saj0mgutxm4teywre6dl8wqf58xamqdrukln'
};

const wallets = JSON.parse(fs.readFileSync('/root/agents/bon/challenge4/wallets-c4.json', 'utf8'));
const tc = new TransactionComputer();

async function fundFromGL() {
  const json = JSON.parse(fs.readFileSync('/root/agents/wallets/gl-wallet.json', 'utf8'));
  const mnemonic = UserWallet.decryptMnemonic(json, GL_PASSWORD);
  const sk = mnemonic.deriveKey(0);
  const signer = new UserSigner(sk);
  const d = await fetch(GATEWAY + '/address/' + GL).then(r => r.json());
  let nonce = d?.data?.account?.nonce || 0;
  const glBalance = BigInt(d?.data?.account?.balance || 0);
  console.log('GL Balance:', (glBalance / BigInt('1000000000000000000')).toString(), 'EGLD, Nonce:', nonce);

  for (const w of wallets) {
    const tx = new Transaction({
      sender: new Address(GL),
      receiver: new Address(w.address),
      value: FUND_AMOUNT,
      gasLimit: 50000n,
      gasPrice: 1000000000n,
      nonce: BigInt(nonce++),
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
      console.log('Funded Shard', w.shard, '50 EGLD | TX:', res.data.txHash);
    } else {
      console.log('FAILED Shard', w.shard, ':', JSON.stringify(res));
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('Funding done, waiting 10s before wrapping...');
  await new Promise(r => setTimeout(r, 10000));
}

async function wrapAll() {
  for (const w of wallets) {
    const sk = UserSecretKey.fromString(w.privateKeyHex);
    const signer = new UserSigner(sk);
    const d = await fetch(GATEWAY + '/address/' + w.address).then(r => r.json());
    const nonce = d?.data?.account?.nonce || 0;

    const tx = new Transaction({
      sender: new Address(w.address),
      receiver: new Address(WRAP_CONTRACTS[w.shard]),
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
      console.log('Wrapped Shard', w.shard, '40 EGLD -> WEGLD | TX:', res.data.txHash);
    } else {
      console.log('FAILED wrap Shard', w.shard, ':', JSON.stringify(res));
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('Wrap done!');
}

async function checkBalances() {
  for (const w of wallets) {
    const d = await fetch(GATEWAY + '/address/' + w.address).then(r => r.json());
    const egld = BigInt(d?.data?.account?.balance || 0);
    const esdts = await fetch(GATEWAY + '/address/' + w.address + '/esdt').then(r => r.json());
    const wegld = BigInt(esdts?.data?.esdts?.['WEGLD-bd4d79']?.balance || 0);
    console.log('Shard', w.shard, '| EGLD:', (egld / BigInt('1000000000000000000')).toString(), '| WEGLD:', (wegld / BigInt('1000000000000000000')).toString());
  }
}

(async () => {
  console.log('=== REFUND + WRAP SCRIPT ===');
  await fundFromGL();
  await wrapAll();
  console.log('Waiting 10s then checking balances...');
  await new Promise(r => setTimeout(r, 10000));
  await checkBalances();
  console.log('DONE');
})().catch(console.error);
