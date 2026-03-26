const {UserSecretKey, UserSigner} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-wallet');
const {Transaction, TransactionComputer, Address} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-core');
const fs = require('fs');

const GATEWAY = 'https://gateway.battleofnodes.com';
const DEX = 'erd1qqqqqqqqqqqqqpgqeel2kumf0r8ffyhth7pqdujjat9nx0862jpsg2pqaq';
const WEGLD_HEX = Buffer.from('WEGLD-bd4d79').toString('hex');
const USDC_HEX = Buffer.from('USDC-c76f1f').toString('hex');
const SWAP_HEX = Buffer.from('swapTokensFixedInput').toString('hex');
const DEX_HEX = Buffer.from(new Address(DEX).getPublicKey()).toString('hex');
const AMOUNT_HEX = BigInt('10000000000000').toString(16).padStart(16, '0');
const GAS_LIMIT = 50000000n;

const contracts = JSON.parse(fs.readFileSync('/root/agents/bon/challenge4/contracts.json', 'utf8'));
const wallets = JSON.parse(fs.readFileSync('/root/agents/bon/challenge4/wallets-c4.json', 'utf8'));
const contractByShard = {};
for (const c of contracts) contractByShard[c.shard] = c.contractAddress;
const shard1Contract = contractByShard[1];
const tc = new TransactionComputer();

const METHODS = {
  blindSync:       { hex: Buffer.from('blindSync').toString('hex'),       shardOnly: 1 },
  blindAsyncV1:    { hex: Buffer.from('blindAsyncV1').toString('hex'),    shardOnly: null },
  blindAsyncV2:    { hex: Buffer.from('blindAsyncV2').toString('hex'),    shardOnly: null },
  blindTransfExec: { hex: Buffer.from('blindTransfExec').toString('hex'), shardOnly: null },
};

const stats = { blindSync: 0, blindAsyncV1: 0, blindAsyncV2: 0, blindTransfExec: 0, failed: 0 };
const nonces = {};
let running = false;
const startTime = Date.now();

async function initNonces() {
  for (const w of wallets) {
    const d = await fetch(GATEWAY + '/address/' + w.address).then(r => r.json());
    nonces[w.address] = d?.data?.account?.nonce || 0;
    console.log('Shard', w.shard, 'nonce:', nonces[w.address]);
  }
}

async function sendCall(wallet, methodName) {
  const method = METHODS[methodName];
  const contractAddr = methodName === 'blindSync' ? shard1Contract : contractByShard[wallet.shard];
  const sk = UserSecretKey.fromString(wallet.privateKeyHex);
  const signer = new UserSigner(sk);
  const data = 'ESDTTransfer@' + WEGLD_HEX + '@' + AMOUNT_HEX + '@' + method.hex + '@' + DEX_HEX + '@' + SWAP_HEX + '@' + USDC_HEX + '@01';

  const tx = new Transaction({
    sender: new Address(wallet.address),
    receiver: new Address(contractAddr),
    value: 0n,
    gasLimit: GAS_LIMIT,
    gasPrice: 1000000000n,
    nonce: BigInt(nonces[wallet.address]++),
    chainID: 'B',
    version: 1,
    data: Buffer.from(data)
  });

  const sig = await signer.sign(tc.computeBytesForSigning(tx));
  tx.signature = sig;

  try {
    const res = await fetch(GATEWAY + '/transaction/send', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(tx.toSendable())
    }).then(r => r.json());

    if (res.data?.txHash) {
      stats[methodName]++;
      return true;
    } else {
      const err = (res.error || '').toLowerCase();
      if (err.includes('nonce') || err.includes('lower')) {
        const d = await fetch(GATEWAY + '/address/' + wallet.address).then(r => r.json());
        nonces[wallet.address] = d?.data?.account?.nonce || nonces[wallet.address];
      }
      stats.failed++;
      return false;
    }
  } catch(e) {
    stats.failed++;
    return false;
  }
}

async function walletLoop(wallet) {
  const myMethods = Object.entries(METHODS)
    .filter(([name, m]) => m.shardOnly === null || m.shardOnly === wallet.shard)
    .map(([name]) => name);
  console.log('Shard', wallet.shard, 'methods:', myMethods.join(', '));
  let i = 0;
  while (running) {
    await sendCall(wallet, myMethods[i % myMethods.length]);
    i++;
    await new Promise(r => setTimeout(r, 20));
  }
}

function printStats() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const total = stats.blindSync + stats.blindAsyncV1 + stats.blindAsyncV2 + stats.blindTransfExec;
  console.log('[' + elapsed + 's] sync:' + stats.blindSync + ' v1:' + stats.blindAsyncV1 + ' v2:' + stats.blindAsyncV2 + ' transf:' + stats.blindTransfExec + ' | total:' + total + ' failed:' + stats.failed);
}

async function main() {
  console.log('Initializing nonces...');
  await initNonces();

  const now = new Date();
  const target = new Date(Date.UTC(2026, 2, 26, 16, 0, 0));
  const waitMs = target - now;
  if (waitMs > 0) {
    console.log('Waiting', Math.floor(waitMs / 1000), 'seconds until 16:00 UTC...');
    await new Promise(r => setTimeout(r, waitMs));
  }

  console.log('=== SPRINT START ===');
  running = true;
  const statsInterval = setInterval(printStats, 10000);

  setTimeout(() => {
    running = false;
    clearInterval(statsInterval);
    printStats();
    console.log('=== SPRINT END ===');
    process.exit(0);
  }, 61 * 60 * 1000);

  await Promise.all(wallets.map(w => walletLoop(w)));
}

main().catch(console.error);
