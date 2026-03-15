const {UserWallet,UserSigner}=require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-wallet');
const {Transaction,TransactionComputer,Address}=require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-core');
const fs=require('fs');
const API='https://api.battleofnodes.com';
const wallets=JSON.parse(fs.readFileSync('/root/agents/bon/wallets-500.json','utf8'));
let total=0; const start=Date.now();

async function sprintWallet(w){
  const json=JSON.parse(fs.readFileSync('/root/agents/wallets/gl-wallet.json','utf8'));
  const mnemonic=UserWallet.decryptMnemonic(json,'@221182Tommy');
  // derive wallet from index
  const sk=mnemonic.deriveKey(0);
  // use wallet private key
  const wsk=require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-wallet').UserSecretKey.fromString(w.privateKeyHex);
  const signer=new UserSigner(wsk);
  const addr=wsk.generatePublicKey().toAddress().bech32();
  let acc=await fetch(`${API}/accounts/${addr}`).then(r=>r.json()).catch(()=>null);
  if(!acc||BigInt(acc.balance||0)<50000000000000n){return;}
  let nonce=acc.nonce;
  const tc=new TransactionComputer();
  while(Date.now()-start<25*60*1000){
    try{
      const tx=new Transaction({sender:new Address(addr),receiver:new Address('erd10xsxzsaevkv70ysuxlakv7ctku8x4q0l6eqfpfellcpefxenx0kqlzsp8d'),value:1n,gasLimit:50000n,gasPrice:1000000000n,nonce:BigInt(nonce),chainID:'B',version:1});
      const sig=await signer.sign(tc.computeBytesForSigning(tx));
      tx.signature=sig;
      const r=await fetch(`${API}/transaction/send`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(tx.toSendable())});
      const d=await r.json();
      if(d.data?.txHash){nonce++;total++;}
      else if(d.error?.includes('lowerNonce')){nonce=await fetch(`${API}/accounts/${addr}`).then(r=>r.json()).then(a=>a.nonce);}
    }catch(e){}
  }
}

async function main(){
  console.log('Sprint starting with',wallets.length,'wallets');
  setInterval(()=>console.log(`TXs: ${total} | ${(total/((Date.now()-start)/60000)).toFixed(0)} tx/min`),15000);
  await Promise.all(wallets.map(w=>sprintWallet(w)));
  console.log('DONE total:',total);
}
main();
