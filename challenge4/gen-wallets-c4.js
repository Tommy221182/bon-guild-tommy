const {UserSigner, UserSecretKey, Mnemonic} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-wallet');
const {Address} = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-core');
const fs = require('fs');

function getShard(addrStr) {
  const pub = new Address(addrStr).getPublicKey();
  const b = pub[31];
  const s = b & 3;
  return s >= 3 ? s & 1 : s;
}

const wallets = [];
for (let targetShard = 0; targetShard <= 2; targetShard++) {
  let found = false;
  while (found === false) {
    const mnemonic = Mnemonic.generate();
    const sk = mnemonic.deriveKey(0);
    const addr = sk.generatePublicKey().toAddress().bech32();
    const shard = getShard(addr);
    if (shard === targetShard) {
      wallets.push({ address: addr, shard, privateKeyHex: sk.hex() });
      console.log('Shard', targetShard, ':', addr);
      found = true;
    }
  }
}
fs.writeFileSync('/root/agents/bon/challenge4/wallets-c4.json', JSON.stringify(wallets, null, 2));
console.log('Saved wallets-c4.json');
