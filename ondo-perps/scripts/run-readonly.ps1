$ErrorActionPreference = 'Stop'

Write-Host 'Ondo Perps authorized read-only runner' -ForegroundColor Cyan
Write-Host 'Target policy: production public reads + sandbox negative auth probes only.'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 20+ is required.'
}

$nodeVersion = node -p "Number(process.versions.node.split('.')[0])"
if ([int]$nodeVersion -lt 20) {
    throw "Node.js 20+ is required; found $(node --version)."
}

if (-not (Test-Path 'node_modules')) {
    npm install --no-audit --no-fund
}

npm run recon
npm run siwe

if ($env:ONDO_JWT) {
    npm run invariants
    npm run ws
    npm run authz
} else {
    Write-Host 'ONDO_JWT is not set; authenticated read-only modules were skipped.' -ForegroundColor Yellow
    npm run ws
    npm run authz
}

Write-Host 'Completed. Redacted local evidence is under artifacts/ (gitignored).' -ForegroundColor Green
