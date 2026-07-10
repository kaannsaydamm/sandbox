# Security Research Sandbox

Isolated workspace for authorized bug-bounty research and reproducible local test harnesses.

## Rules

- No production secrets, private keys, session tokens, or customer data.
- No CI workflows or Git LFS.
- Tests must target explicitly authorized scopes, local mocks, or published sandboxes/testnets.
- Unreported vulnerability details and raw evidence must remain outside this public repository.
- Each target lives in its own directory and branch.

## Current target

- `ondo-perps/` — Ondo Perps authorized research harness.
