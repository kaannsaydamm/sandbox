import { randomUUID } from 'node:crypto'
import {
  SANDBOX_API,
  apiKeyHeaders,
  bearer,
  request,
  sleep,
  writeArtifact,
} from './lib/common.mjs'

const BASE_URL = process.env.ONDO_API_URL ?? SANDBOX_API
const JWT = process.env.ONDO_JWT
const API_KEY_ID = process.env.ONDO_API_KEY_ID
const API_KEY_SECRET = process.env.ONDO_API_KEY_SECRET
const ALLOW_INVALID_WRITES = process.argv.includes('--allow-invalid-write-probes')
const DELAY_MS = 900

if (BASE_URL !== SANDBOX_API) {
  throw new Error('Authorization mutation probes are sandbox-only.')
}

const credentials = [
  { name: 'anonymous', headers: {} },
  ...(JWT ? [{ name: 'jwt', headers: bearer(JWT) }] : []),
  ...(API_KEY_ID && API_KEY_SECRET
    ? [{ name: 'api-key', headers: apiKeyHeaders(API_KEY_ID, API_KEY_SECRET) }]
    : []),
  ...(API_KEY_ID ? [{ name: 'api-id-without-secret', headers: { 'X-API-KEY-ID': API_KEY_ID } }] : []),
  ...(API_KEY_SECRET ? [{ name: 'api-secret-without-id', headers: bearer(API_KEY_SECRET) }] : []),
  ...(JWT && API_KEY_ID
    ? [{ name: 'jwt-plus-api-id', headers: { ...bearer(JWT), 'X-API-KEY-ID': API_KEY_ID } }]
    : []),
  ...(JWT
    ? [{ name: 'jwt-plus-random-api-id', headers: { ...bearer(JWT), 'X-API-KEY-ID': randomUUID() } }]
    : []),
]

const reads = [
  { name: 'account', method: 'GET', path: '/v1/account' },
  { name: 'balance', method: 'GET', path: '/v1/perps/balance' },
  { name: 'positions', method: 'GET', path: '/v1/perps/positions' },
  { name: 'orders', method: 'GET', path: '/v1/perps/orders?limit=1' },
  { name: 'fills', method: 'GET', path: '/v1/perps/fills?limit=1' },
  { name: 'funding-fees', method: 'GET', path: '/v1/perps/funding_fees?limit=1' },
  { name: 'liquidations', method: 'GET', path: '/v1/perps/liquidation_history?limit=1' },
  { name: 'referral', method: 'GET', path: '/v1/account/referral' },
  { name: 'api-keys', method: 'GET', path: '/v1/api_keys' },
  { name: 'address-book', method: 'GET', path: '/v1/wallet/address_book' },
]

const invalidWrites = [
  {
    name: 'order-invalid-market-zero-size',
    method: 'POST',
    path: '/v1/perps/orders',
    body: {
      market: `INVALID-${randomUUID()}`,
      side: 'buy',
      size: '0',
      type: 'limit',
      price: '0',
      timeInForce: 'GTC',
      postOnly: true,
      clientOrderId: `authz-invalid-${randomUUID()}`,
    },
  },
  {
    name: 'leverage-invalid-market-zero',
    method: 'POST',
    path: '/v1/perps/leverage',
    body: { market: `INVALID-${randomUUID()}`, leverage: 0 },
  },
  {
    name: 'cancel-random-order',
    method: 'DELETE',
    path: `/v1/perps/orders/${randomUUID()}`,
  },
  {
    name: 'withdraw-empty-body',
    method: 'POST',
    path: '/v1/withdraw',
    body: {},
  },
  {
    name: 'provision-address-invalid-network',
    method: 'POST',
    path: '/v1/provision_address',
    body: { network: `invalid-${randomUUID()}` },
  },
  {
    name: 'address-book-random-delete',
    method: 'DELETE',
    path: `/v1/wallet/address_book/${randomUUID()}`,
  },
]

function classify(item) {
  const status = item.response?.status
  const code = item.envelope?.errorCode
  if (status === 401 || status === 403) return 'auth-rejected'
  if (status === 404) return 'not-found-or-route-hidden'
  if (status >= 400 && status < 500) return `validated:${code ?? status}`
  if (status >= 500) return `server-error:${status}`
  if (status >= 200 && status < 300) return 'accepted'
  return item.error ? `transport:${item.error.name}` : 'unknown'
}

async function runProbe(probe, credential) {
  const result = await request({
    baseUrl: BASE_URL,
    path: probe.path,
    method: probe.method,
    body: probe.body,
    headers: credential.headers,
  })
  return {
    credential: credential.name,
    probe: probe.name,
    classification: classify(result),
    result,
  }
}

async function main() {
  const evidence = {
    generatedAt: new Date().toISOString(),
    target: BASE_URL,
    safeguards: {
      productionBlocked: true,
      sequential: true,
      invalidWritesOnly: true,
      writeProbeFlag: ALLOW_INVALID_WRITES,
      credentialsAvailable: credentials.map((c) => c.name),
    },
    reads: [],
    invalidWrites: [],
  }

  for (const credential of credentials) {
    for (const probe of reads) {
      evidence.reads.push(await runProbe(probe, credential))
      await sleep(DELAY_MS)
    }
  }

  if (ALLOW_INVALID_WRITES) {
    for (const credential of credentials) {
      for (const probe of invalidWrites) {
        evidence.invalidWrites.push(await runProbe(probe, credential))
        await sleep(DELAY_MS)
      }
    }
  }

  const acceptedInvalidWrites = evidence.invalidWrites.filter((x) => x.classification === 'accepted')
  const mixedCredentialReads = evidence.reads.filter((x) => x.credential.includes('plus-'))
  evidence.review = {
    acceptedInvalidWriteCount: acceptedInvalidWrites.length,
    acceptedInvalidWrites: acceptedInvalidWrites.map((x) => ({ credential: x.credential, probe: x.probe })),
    mixedCredentialReads: mixedCredentialReads.map((x) => ({
      credential: x.credential,
      probe: x.probe,
      classification: x.classification,
    })),
    interpretation: [
      'Anonymous private reads/writes must reject before business validation.',
      'API keys should expose only endpoints allowed by their scopes.',
      'Ambiguous JWT + API-key-ID requests should reject rather than silently selecting the more privileged credential.',
      'A 2xx for an intentionally invalid write is a manual-review signal, not automatically a vulnerability.',
    ],
  }

  console.log(await writeArtifact('authz-matrix', evidence))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
