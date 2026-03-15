'use strict';
// sprint-v2.js — Production Transaction Sprint for MultiversX Battle of Nodes Guild Wars
// Architecture: System 1 (500 concurrent wallet sprinters) + System 2 (GL refund engine)

const { UserWallet, UserSigner, UserSecretKey } = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-wallet');
const { Transaction, TransactionComputer, Address } = require('/root/agents/projects/oracle-agent/node_modules/@multiversx/sdk-core');
const fs = require('fs');

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const API          = 'https://api.battleofnodes.com';
const CHAIN        = 'B';
const GL_ADDRESS   = 'erd10xsxzsaevkv70ysuxlakv7ctku8x4q0l6eqfpfellcpefxenx0kqlzsp8d';
const GL_PASSWORD  = '@221182Tommy';

const BATCH_SIZE        = 5;                   // TXs fired simultaneously per wallet
const MIN_BALANCE       = 50000000000000n;     // 0.00005 EGLD — stop sending below this
const REFUND_THRESHOLD  = 100000000000000000n; // 0.1 EGLD  — trigger refund
const REFUND_AMOUNT     = 2000000000000000000n;// 2 EGLD per refill
const TX_VALUE          = 1n;                  // 1 attoEGLD
const GAS_LIMIT         = 50000n;
const GAS_PRICE         = 1000000000n;
const REFUND_INTERVAL   = 30_000;             // 30 seconds between refund sweeps
const STATS_INTERVAL    = 15_000;             // 15 seconds between stats logs
const REFUND_WAIT_MAX   = 60_000;             // max wait for refund before skipping wallet

// ─── GLOBAL STATS ─────────────────────────────────────────────────────────────
let totalTxs      = 0;
let totalRefunds  = 0;
let activeWallets = 0;
const start       = Date.now();

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAccount(address) {
  const r = await fetch(`${API}/accounts/${address}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json(); // flat: { balance, nonce, ... }
}

async function sendTx(tx) {
  const r = await fetch(`${API}/transaction/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tx.toSendable()),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json(); // { data: { txHash }, error, ... }
}

function buildTx(senderAddr, nonce) {
  return new Transaction({
    sender:   new Address(senderAddr),
    receiver: new Address(GL_ADDRESS),
    value:    TX_VALUE,
    gasLimit: GAS_LIMIT,
    gasPrice: GAS_PRICE,
    nonce:    BigInt(nonce),
    chainID:  CHAIN,
    version:  1,
  });
}

async function signTx(signer, tx) {
  const tc = new TransactionComputer();
  const sig = await signer.sign(tc.computeBytesForSigning(tx));
  tx.signature = sig;
  return tx;
}

// ─── SYSTEM 1: SPRINT ENGINE ──────────────────────────────────────────────────
async function sprintWallet(w, durationMs) {
  const wsk    = UserSecretKey.fromString(w.privateKeyHex);
  const signer = new UserSigner(wsk);
  const addr   = wsk.generatePublicKey().toAddress().bech32();
  const tc     = new TransactionComputer();
  const endAt  = start + durationMs;

  // Initial account fetch
  let acc;
  try {
    acc = await fetchAccount(addr);
  } catch (e) {
    return; // can't even fetch — skip
  }

  // Skip if balance too low and we're not expecting a refund yet
  if (BigInt(acc.balance) < MIN_BALANCE) {
    // Wait up to REFUND_WAIT_MAX for balance to be topped up
    const waitEnd = Date.now() + REFUND_WAIT_MAX;
    while (Date.now() < waitEnd && Date.now() < endAt) {
      await sleep(3000);
      try { acc = await fetchAccount(addr); } catch (_) { continue; }
      if (BigInt(acc.balance) >= MIN_BALANCE) break;
    }
    if (BigInt(acc.balance) < MIN_BALANCE) return; // still empty — skip
  }

  let nonce = acc.nonce;
  activeWallets++;

  try {
    while (Date.now() < endAt) {
      // Check balance — pause if low
      if (BigInt(acc.balance) < MIN_BALANCE) {
        activeWallets--;
        const waitEnd = Date.now() + REFUND_WAIT_MAX;
        let refilled = false;
        while (Date.now() < waitEnd && Date.now() < endAt) {
          await sleep(3000);
          try { acc = await fetchAccount(addr); } catch (_) { continue; }
          if (BigInt(acc.balance) >= MIN_BALANCE) { refilled = true; break; }
        }
        if (!refilled) return; // time's up or no refund — exit
        activeWallets++;
        nonce = acc.nonce; // re-sync nonce after refill pause
      }

      // Build and pre-sign BATCH_SIZE transactions
      const queue = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        const tx = buildTx(addr, nonce + i);
        await signTx(signer, tx);
        queue.push(tx);
      }

      // Fire all simultaneously
      const results = await Promise.allSettled(
        queue.map(tx => sendTx(tx))
      );

      let nonceReset = false;
      for (let i = 0; i < results.length; i++) {
        const res = results[i];

        if (res.status === 'rejected') {
          // Network / HTTP error — retry once
          await sleep(1000);
          try {
            const retry = await sendTx(queue[i]);
            if (retry?.data?.txHash) { nonce++; totalTxs++; }
          } catch (_) { /* skip this nonce slot */ nonce++; }
          continue;
        }

        const d = res.value;

        if (d?.data?.txHash) {
          nonce++;
          totalTxs++;
          continue;
        }

        const err = (d?.error || d?.message || '').toLowerCase();

        if (err.includes('lowernonce') || err.includes('veryhighnonce')) {
          // Re-fetch nonce from API and rebuild entire queue
          nonceReset = true;
          try {
            const fresh = await fetchAccount(addr);
            nonce = fresh.nonce;
            acc = fresh;
          } catch (_) { /* keep current nonce */ }
          break; // break inner results loop, will rebuild queue next iteration
        }

        if (err.includes('insufficient funds') || err.includes('not enough')) {
          acc.balance = '0'; // force balance check on next loop
          break;
        }

        // Any other error — advance nonce and continue
        nonce++;
      }

      // Refresh balance estimate periodically (after each batch)
      if (!nonceReset) {
        try {
          acc = await fetchAccount(addr);
          nonce = Math.max(nonce, acc.nonce); // never go backwards
        } catch (_) { /* keep local nonce */ }
      }
    }
  } finally {
    activeWallets = Math.max(0, activeWallets - 1);
  }
}

// ─── SYSTEM 2: REFUND ENGINE ──────────────────────────────────────────────────
async function refundEngine(wallets, durationMs) {
  // Load GL wallet
  const json     = JSON.parse(fs.readFileSync('/root/agents/wallets/gl-wallet.json', 'utf8'));
  const mnemonic = UserWallet.decryptMnemonic(json, GL_PASSWORD);
  const sk       = mnemonic.deriveKey(0);
  const glSigner = new UserSigner(sk);
  const tc       = new TransactionComputer();
  const endAt    = start + durationMs;

  // Fetch initial GL nonce
  let glAcc;
  try {
    glAcc = await fetchAccount(GL_ADDRESS);
  } catch (e) {
    console.error('[REFUND] Failed to fetch GL wallet account:', e.message);
    return;
  }
  let glNonce = glAcc.nonce;

  while (Date.now() < endAt) {
    await sleep(REFUND_INTERVAL);
    if (Date.now() >= endAt) break;

    // Check all 500 wallets in batches of 50
    const lowWallets = [];
    const BATCH = 50;
    for (let i = 0; i < wallets.length; i += BATCH) {
      const batch = wallets.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(w => fetchAccount(w.address))
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'fulfilled') {
          const acc = results[j].value;
          if (BigInt(acc.balance) < REFUND_THRESHOLD) {
            lowWallets.push(wallets[i + j]);
          }
        }
      }
    }

    if (lowWallets.length === 0) continue;

    // Send refund TXs from GL wallet
    let sent = 0;
    for (let i = 0; i < lowWallets.length; i++) {
      const w = lowWallets[i];
      try {
        const tx = new Transaction({
          sender:   new Address(GL_ADDRESS),
          receiver: new Address(w.address),
          value:    REFUND_AMOUNT,
          gasLimit: GAS_LIMIT,
          gasPrice: GAS_PRICE,
          nonce:    BigInt(glNonce),
          chainID:  CHAIN,
          version:  1,
        });
        const sig = await glSigner.sign(tc.computeBytesForSigning(tx));
        tx.signature = sig;
        const d = await sendTx(tx);

        if (d?.data?.txHash) {
          glNonce++;
          sent++;
          totalRefunds++;
        } else {
          const err = (d?.error || d?.message || '').toLowerCase();
          if (err.includes('lowernonce') || err.includes('veryhighnonce') || err.includes('nonce')) {
            // Re-fetch GL nonce and retry this wallet
            try {
              const fresh = await fetchAccount(GL_ADDRESS);
              glNonce = fresh.nonce;
            } catch (_) {}
            // Retry
            try {
              const txRetry = new Transaction({
                sender:   new Address(GL_ADDRESS),
                receiver: new Address(w.address),
                value:    REFUND_AMOUNT,
                gasLimit: GAS_LIMIT,
                gasPrice: GAS_PRICE,
                nonce:    BigInt(glNonce),
                chainID:  CHAIN,
                version:  1,
              });
              const sig2 = await glSigner.sign(tc.computeBytesForSigning(txRetry));
              txRetry.signature = sig2;
              const d2 = await sendTx(txRetry);
              if (d2?.data?.txHash) { glNonce++; sent++; totalRefunds++; }
            } catch (_) {}
          }
        }
      } catch (e) {
        console.error(`[REFUND] Network error for ${w.address.slice(0, 12)}:`, e.message);
      }
    }

    console.log(`[REFUND] Refunded ${sent}/${lowWallets.length} wallets | GL nonce now: ${glNonce}`);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const TEST_MODE = args.includes('--test');
  const durationArg = args.find(a => /^\d+$/.test(a));
  const DURATION_MIN = durationArg ? parseInt(durationArg, 10) : 28;
  const DURATION_MS  = DURATION_MIN * 60 * 1000;

  console.log(`\n=== Sprint V2 | ${DURATION_MIN} min | ${TEST_MODE ? 'TEST MODE' : 'FULL MODE'} ===\n`);

  // Load GL wallet
  let glSk;
  try {
    const json     = JSON.parse(fs.readFileSync('/root/agents/wallets/gl-wallet.json', 'utf8'));
    const mnemonic = UserWallet.decryptMnemonic(json, GL_PASSWORD);
    glSk = mnemonic.deriveKey(0);
    const derived = glSk.generatePublicKey().toAddress().bech32();
    console.log(`GL Wallet: ${derived}`);
    if (derived !== GL_ADDRESS) console.warn(`[WARN] Derived address differs from GL_ADDRESS constant`);
  } catch (e) {
    console.error('Failed to load GL wallet:', e.message);
    process.exit(1);
  }

  // Check GL balance
  try {
    const glAcc = await fetchAccount(GL_ADDRESS);
    const glBalance = BigInt(glAcc.balance);
    const glEgld = Number(glBalance) / 1e18;
    console.log(`GL Balance: ${glEgld.toFixed(4)} EGLD | Nonce: ${glAcc.nonce}`);
    if (glEgld < 100) console.warn(`[WARN] GL balance < 100 EGLD — may not cover all refunds`);
  } catch (e) {
    console.error('Failed to fetch GL balance:', e.message);
    process.exit(1);
  }

  // Load wallets
  let allWallets = JSON.parse(fs.readFileSync('/root/agents/bon/wallets-500.json', 'utf8'));
  if (TEST_MODE) allWallets = allWallets.slice(0, 5);
  const walletCount = allWallets.length;
  console.log(`Loaded ${walletCount} wallets${TEST_MODE ? ' (test: first 5)' : ''}\n`);

  // Stats logger
  const statsInterval = setInterval(() => {
    const elapsed = (Date.now() - start) / 60000;
    const rate    = elapsed > 0 ? Math.round(totalTxs / elapsed) : 0;
    console.log(
      `TXs: ${totalTxs} | Rate: ${rate} tx/min | Wallets active: ${activeWallets}/${walletCount} | Refunds: ${totalRefunds}`
    );
  }, STATS_INTERVAL);

  // Run both systems in parallel
  await Promise.all([
    Promise.all(allWallets.map(w => sprintWallet(w, DURATION_MS))),
    refundEngine(allWallets, DURATION_MS),
  ]);

  clearInterval(statsInterval);

  // Final report
  const totalMin = (Date.now() - start) / 60000;
  const avgRate  = totalMin > 0 ? Math.round(totalTxs / totalMin) : 0;
  let finalGlBalance = '?';
  try {
    const glFinal = await fetchAccount(GL_ADDRESS);
    finalGlBalance = (Number(BigInt(glFinal.balance)) / 1e18).toFixed(4) + ' EGLD';
  } catch (_) {}

  console.log(`\n=== DONE ===`);
  console.log(`Total TXs: ${totalTxs} | Duration: ${totalMin.toFixed(2)} min | Avg rate: ${avgRate} tx/min`);
  console.log(`Refund TXs sent: ${totalRefunds} | Final GL balance: ${finalGlBalance}`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
