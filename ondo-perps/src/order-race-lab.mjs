import { randomUUID } from 'node:crypto'
import { SANDBOX_API, bearer, request, sleep, writeArtifact } from './lib/common.mjs'

const BASE_URL = process.env.ONDO_API_URL ?? SANDBOX_API
const JWT = process.env.ONDO_JWT
const MARKET = process.env.ONDO_MARKET
const PRICE = process.env.ONDO_SAFE_PRICE
const SIZE = process.env.ONDO_SAFE_SIZE
const SIDE = process.env.ONDO_SAFE_SIDE ?? 'buy'
const ALLOW = process.argv.includes('--allow-state-change')
const DELAY_MS = 1000

if (!ALLOW) throw new Error('Pass --allow-state-change after reviewing the configured sandbox order.')
if (!JWT) throw new Error('Set ONDO_JWT to your own sandbox session token.')
if (!MARKET || !PRICE || !SIZE) throw new Error('Set ONDO_MARKET, ONDO_SAFE_PRICE, and ONDO_SAFE_SIZE.')
if (!['buy', 'sell'].includes(SIDE)) throw new Error('ONDO_SAFE_SIDE must be buy or sell.')
if (BASE_URL !== SANDBOX_API) throw new Error('Order race lab is hard-locked to the published sandbox.')

const headers = bearer(JWT)

function orderBody(clientOrderId) {
  return {
    market: MARKET,
    side: SIDE,
    type: 'limit',
    price: PRICE,
    size: SIZE,
    timeInForce: 'GTC',
    postOnly: true,
    reduceOnly: false,
    clientOrderId,
  }
}

async function place(body) {
  return request({ baseUrl: BASE_URL, path: '/v1/perps/orders', method: 'POST', body, headers })
}

async function cancel(orderId) {
  return request({
    baseUrl: BASE_URL,
    path: `/v1/perps/orders/${encodeURIComponent(orderId)}`,
    method: 'DELETE',
    headers,
  })
}

function orderIdOf(result) {
  const value = result.envelope?.result
  return value && typeof value === 'object' && typeof value.orderId === 'string' ? value.orderId : undefined
}

async function cleanup(orderIds, evidence) {
  for (const id of [...new Set(orderIds.filter(Boolean))]) {
    await sleep(DELAY_MS)
    evidence.cleanup.push({ orderId: id, result: await cancel(id) })
  }
}

async function main() {
  const evidence = {
    generatedAt: new Date().toISOString(),
    target: BASE_URL,
    configuration: { market: MARKET, price: PRICE, size: SIZE, side: SIDE, postOnly: true },
    safeguards: {
      sandboxOnly: true,
      maxConcurrentRequests: 2,
      orderCountCap: 4,
      cleanupAttempted: true,
      thirdPartyAccounts: false,
    },
    probes: [],
    cleanup: [],
    signals: [],
  }
  const created = []

  try {
    const concurrentClientId = `ondo-lab-dup-concurrent-${randomUUID()}`
    const concurrentPayload = orderBody(concurrentClientId)
    const concurrent = await Promise.all([place(concurrentPayload), place(concurrentPayload)])
    const concurrentIds = concurrent.map(orderIdOf).filter(Boolean)
    created.push(...concurrentIds)
    evidence.probes.push({
      name: 'concurrent-identical-client-order-id',
      clientOrderId: concurrentClientId,
      results: concurrent,
      orderIds: concurrentIds,
    })
    if (new Set(concurrentIds).size > 1) {
      evidence.signals.push({
        id: 'DUPLICATE-CLIENT-ORDER-ID-CONCURRENT',
        severityGate: 'candidate',
        detail: 'The same clientOrderId mapped to multiple accepted orderIds under concurrency.',
      })
    }

    await cleanup(concurrentIds, evidence)
    await sleep(DELAY_MS)

    const serialClientId = `ondo-lab-dup-serial-${randomUUID()}`
    const first = await place(orderBody(serialClientId))
    const firstId = orderIdOf(first)
    if (firstId) created.push(firstId)
    await sleep(DELAY_MS)
    const second = await place(orderBody(serialClientId))
    const secondId = orderIdOf(second)
    if (secondId) created.push(secondId)
    evidence.probes.push({
      name: 'serial-identical-client-order-id',
      clientOrderId: serialClientId,
      results: [first, second],
      orderIds: [firstId, secondId].filter(Boolean),
    })
    if (firstId && secondId && firstId !== secondId) {
      evidence.signals.push({
        id: 'DUPLICATE-CLIENT-ORDER-ID-SERIAL',
        severityGate: 'candidate',
        detail: 'A repeated clientOrderId created a second distinct order instead of rejecting or returning the original.',
      })
    }

    if (firstId) {
      const doubleCancel = await Promise.all([cancel(firstId), cancel(firstId)])
      evidence.probes.push({ name: 'concurrent-double-cancel', orderId: firstId, results: doubleCancel })
      const accepted = doubleCancel.filter((x) => x.response?.status >= 200 && x.response?.status < 300)
      if (accepted.length === 2) {
        evidence.signals.push({
          id: 'DOUBLE-CANCEL-BOTH-SUCCEEDED',
          severityGate: 'manual-review',
          detail: 'Both concurrent cancellations returned success; inspect ledger/events for duplicate side effects.',
        })
      }
    }
  } finally {
    await cleanup(created, evidence)
  }

  evidence.summary = {
    signalCount: evidence.signals.length,
    reportable: false,
    nextGate: 'A signal becomes reportable only after proving duplicate execution, excess reserved margin, fee duplication, or another concrete financial/state impact.',
  }
  console.log(await writeArtifact('order-race-lab', evidence))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
