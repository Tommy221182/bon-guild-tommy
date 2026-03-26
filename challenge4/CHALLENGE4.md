# Guild TOMMY — Challenge 4: Contract Storm

## Results
| Call Type | Successful Calls |
|-----------|-----------------|
| blindSync | 13,723 |
| blindAsyncV1 | 50,461 |
| blindAsyncV2 | 50,405 |
| blindTransfExec | 50,523 |
| **Total** | **165,112** |

## Overview
Challenge 4 tested smart contract composability — forwarder contracts calling the xExchange DEX pair (WEGLD/USDC) via four distinct mechanisms, both same-shard and cross-shard.

**Date:** March 26, 2026 | **Window:** 16:00-17:00 UTC | **Network:** BoN shadow fork

## Forwarder Contracts
| Shard | Contract Address |
|-------|-----------------|
| 0 | erd1qqqqqqqqqqqqqpgq5d4c3lzq4fpz467shyugdg3n4n090s0p5asqy5zg8d |
| 1 | erd1qqqqqqqqqqqqqpgq8fs86zl449n52wyswl40es42pa8cvx240whsgdq8k9 |
| 2 | erd1qqqqqqqqqqqqqpgqzl928d4n4rrrclz7s9f24qdes4ad35j7fhfquhm2yx |

Binary: forwarder-blind-bon.wasm (sanctioned binary from mx-sdk-rs)
DEX Pair: erd1qqqqqqqqqqqqqpgqeel2kumf0r8ffyhth7pqdujjat9nx0862jpsg2pqaq (Shard 1)

## Transaction Format
ESDTTransfer @ WEGLD-bd4d79 @ amount @ method @ DEX_addr @ swapTokensFixedInput @ USDC-c76f1f @ 01

## Call Types
- blindSync: Shard 1 only, tokens return to caller, no drain needed
- blindAsyncV1: All shards, drain required cross-shard
- blindAsyncV2: All shards, drain required cross-shard
- blindTransfExec: All shards, drain always required

## Scripts
| Script | Purpose |
|--------|---------|
| gen-wallets-c4.js | Generate one wallet per shard |
| deploy-contracts.js | Deploy forwarder-blind-bon.wasm to each shard |
| wrap-egld.js | Wrap EGLD to WEGLD per shard |
| sprint-c4.js | Main sprint - all 4 call types in parallel |
| drain-c4.js | Drain USDC/WEGLD from forwarder contracts |
| refund-c4.js | Top-up wallets and wrap additional EGLD |

## Key Learnings
- blindSync requires same-shard execution (forwarder on Shard 1 = DEX shard)
- isPayableBySmartContract flag required on forwarder for blindTransfExec
- WEGLD wrap contracts are shard-specific
- Cross-shard tokens stay in forwarder until drained
- Gas limit 50M sufficient for all call types
- Swap amount 0.00001 WEGLD per call - capital recycled via USDC drain
