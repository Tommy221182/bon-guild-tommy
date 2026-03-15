const {UserWallet,UserSigner}=require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-wallet');
const {Transaction,TransactionComputer,Address}=require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-core');
const fs=require('fs');
const API='https://api.battleofnodes.com';
const CHAIN='B';
const json=JSON.parse(fs.readFileSync('/root/agents/wallets/gl-wallet.json','utf8'));
const mnemonic=UserWallet.decryptMnemonic(json,'@221182Tommy');
const sk=mnemonic.deriveKey(0);
const addr=sk.generatePublicKey().toAddress().bech32();
const signer=new UserSigner(sk);
const wallets=JSON.parse(fs.readFileSync('/root/agents/bon/wallets-500.json','utf8'));
const AMOUNT='4000000000000000000'; // 4 EGLD each

async function sendTx(nonce,receiver){
  const tx=new Transaction({sender:new Address(addr),receiver:new Address(receiver),value:BigInt(AMOUNT),gasLimit:50000n,gasPrice:1000000000n,nonce:BigInt(nonce),chainID:CHAIN,version:1});
  const tc=new TransactionComputer();
  const sig=await signer.sign(tc.computeBytesForSigning(tx));
  tx.signature=sig;
  const r=await fetch(`${API}/transaction/send`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(tx.toSendable())});
  const d=await r.json();
  return d.data?.txHash||d.error;
}

async function main(){
  const acc=await fetch(`${API}/accounts/${addr}`).then(r=>r.json());
  let nonce=acc.nonce;
  console.log(`Starting nonce: ${nonce}, balance: ${BigInt(acc.balance)/BigInt(1e18)} EGLD`);
  let ok=0,fail=0;
  const BATCH=50;
  for(let i=0;i<wallets.length;i+=BATCH){
    const batch=wallets.slice(i,i+BATCH);
    const results=await Promise.all(batch.map((w,j)=>sendTx(nonce+j,w.address).catch(e=>e.message)));
    nonce+=batch.length;
    results.forEach((r,j)=>{if(r&&r.length===64){ok++;}else{fail++;console.log(`FAIL[${i+j}]:`,r);}});
    console.log(`Batch ${Math.floor(i/BATCH)+1}/${Math.ceil(wallets.length/BATCH)} — ok:${ok} fail:${fail}`);
  }
  console.log(`DONE: ${ok} funded, ${fail} failed`);
}
main();
