# Guild TOMMY — Challenge 5: Agent Arena

## Overview
Challenge 5 tested autonomous agent development on MultiversX. Agents monitor an admin wallet for on-chain commands, interpret natural language signals, and react in real time.

**Date:** March 27, 2026
**Rounds:** 16:00-16:30 UTC (Round 1) + 17:00-17:30 UTC (Round 2)
**Network:** BoN shadow fork — 600ms block times

## How It Works
- Admin wallet issues start/stop commands as on-chain TX data field messages
- Commands use loose natural language — some adversarial
- Agent must interpret intent (not keyword match) and react immediately
- Green light: send TXs to TARGET wallet as fast as possible
- Red light: stop all TXs immediately
- Score = PermittedTxs - UnpermittedTxs (can go negative)

## Architecture
- Monitor admin wallet via BoN API polling
- LLM-based semantic interpretation of commands
- High-throughput TX pipeline to TARGET wallet
- Immediate kill switch on red light detection

## Agent Registration
- Protocol: MX-8004
- Registry: erd1qqqqqqqqqqqqqpgq4mar8ex8aj2gnc0cq7ay372eqfd5g7t33frqcg776p
- Max 10 agents per guild
- Registration deadline: 15:45 UTC

## Key Learnings
- Keyword matching fails against adversarial commands — LLM interpretation required
- Reaction speed critical — minimum 10s between admin commands
- Sending during red-light windows is penalized (score can go negative)
- All agent wallets must be funded directly from GL wallet — no intermediaries
