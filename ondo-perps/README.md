# Ondo Perps Lab

Local-only harness for low-volume, authorized testing of the published Ondo Perps scope.

## Guardrails

- No GitHub Actions and no Git LFS.
- No mainnet funds or third-party accounts.
- Use a fresh, empty wallet for authenticated tests.
- Do not commit JWTs, signatures, cookies, private keys, HAR files, or raw evidence.
- Default recon is read-only and unauthenticated.

## Run

```bash
cd ondo-perps
node src/recon.mjs
```

Optional challenge-shape test using an empty research wallet address:

```bash
ONDO_RESEARCH_ADDRESS=0x... node src/recon.mjs --auth-recon
```

The script writes redacted JSON under `artifacts/`, which is gitignored.
