# Ondo Perps Authorized Lab

Local-only harness for low-volume, authorized testing of Ondo Perps. The public repository contains tooling and generic hypotheses only; raw evidence and unreported vulnerability details remain local.

## Guardrails

- No GitHub Actions and no Git LFS.
- State-changing tests are hard-locked to `api.ondoperps-sandbox.xyz`.
- Production runs are public/read-only only.
- Use only fresh wallets and accounts controlled by the researcher.
- Never commit JWTs, API keys, signatures, cookies, private keys, HAR files, account identifiers, or raw evidence.
- Do not increase request volume, access third-party data, or continue exploitation after the minimum impact is proven.

## Install

```bash
git clone https://github.com/kaannsaydamm/sandbox.git
cd sandbox
git switch ondo-perps-lab
cd ondo-perps
npm install
```

Node.js 20 or newer is required.

## 1. Public reconnaissance

Sequential GET/OPTIONS requests against the published production and sandbox surfaces:

```bash
npm run recon
```

An optional sandbox challenge-shape request can use a fresh empty address:

```bash
ONDO_RESEARCH_ADDRESS=0x... npm run recon -- --auth-recon
```

## 2. SIWE binding and replay lab

Negative probes use an ephemeral wallet generated in memory and do not complete a valid login:

```bash
npm run siwe
```

To complete exactly one sandbox login and test consumed-challenge replay/JWT integrity:

```bash
npm run siwe -- --allow-account-create
```

An existing disposable key can be supplied through `ONDO_PRIVATE_KEY`; it is never written by the script.

## 3. Authorization matrix

Anonymous access is always tested. JWT and API-key columns are added only when their environment variables are present:

```bash
ONDO_JWT='...' \
ONDO_API_KEY_ID='...' \
ONDO_API_KEY_SECRET='...' \
npm run authz
```

Safe, intentionally invalid write requests require an additional explicit flag:

```bash
ONDO_JWT='...' npm run authz -- --allow-invalid-write-probes
```

## 4. REST accounting invariants

Reads only the researcher's sandbox account and verifies documented arithmetic/state relationships:

```bash
ONDO_JWT='...' npm run invariants
```

## 5. WebSocket auth lifecycle

Public ping/subscriptions run without credentials. Supplying a JWT adds bounded private-channel, second-login, invalid-token, and reconnect probes:

```bash
npm run ws
ONDO_JWT='...' npm run ws
```

Set `ONDO_MARKET` to add one public order-book subscription.

## 6. Duplicate-order and cancellation races

This creates sandbox orders and therefore requires explicit values and approval. The chosen price must be reviewed as demonstrably non-marketable; the script uses post-only GTC orders, caps concurrency at two, and attempts cleanup in `finally`.

```bash
ONDO_JWT='...' \
ONDO_MARKET='AAPL-USD.P' \
ONDO_SAFE_SIDE='buy' \
ONDO_SAFE_PRICE='REVIEW_ME' \
ONDO_SAFE_SIZE='MIN_LOT' \
npm run race -- --allow-state-change
```

Do not run this against production by changing the URL: the script refuses non-sandbox targets.

## Artifacts

Every module writes redacted JSON to `artifacts/`, which is gitignored. A response difference is a candidate signal, not a reportable vulnerability. Promotion requires repeatability and concrete unauthorized financial, state, privacy, or availability impact.

See [`docs/TEST-MATRIX.md`](docs/TEST-MATRIX.md) for the prioritized hypotheses, expected invariants, and severity gates.
