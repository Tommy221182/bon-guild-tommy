# Guild TOMMY — Battle of Nodes Challenge 1

## Transaction Sprint

Scripts for MultiversX Battle of Nodes Guild Wars Challenge 1.

## Setup

```bash
npm install
node generate-500.js   # generate 500 sprint wallets
# fund wallets (see distribute.js)
node sprint.js         # run during challenge windows
```

## Scripts

| Script | Purpose |
|--------|---------|
| `generate-500.js` | Generate 500 fresh keypairs → `wallets-500.json` |
| `distribute.js` | Fund all 500 wallets from GL wallet in batches of 50 |
| `sprint.js` | Run all 500 wallets concurrently during challenge windows |

## Usage

1. Run `generate-500.js` to create wallets
2. Place GL wallet PEM at the path in `distribute.js`
3. Run `distribute.js` when GL wallet is funded (do NOT run early)
4. Run `sprint.js` at 16:00 UTC (Window A) and 17:00 UTC (Window B)

## Results

| Window | Duration | Wallets | Transactions | Fee Spent |
|--------|----------|---------|-------------|-----------|
| A | 30 min | 500 | [X] | ~2000 EGLD |
| B | 30 min | 500 | [Y] | ~500 EGLD |
| **Total** | | | **[Z]** | |

## Architecture

- 500 concurrent wallet streams, nonces managed in memory
- Direct gateway API calls for minimal latency
- Auto-stop after 28 minutes (safety margin before window closes)
- Batch size: 50 parallel transactions per tick

## Network

MultiversX Mainnet — `https://gateway.multiversx.com`
