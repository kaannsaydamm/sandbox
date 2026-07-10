import Big from 'big.js'
import { SANDBOX_API, bearer, request, sleep, writeArtifact } from './lib/common.mjs'

const BASE_URL = process.env.ONDO_API_URL ?? SANDBOX_API
const JWT = process.env.ONDO_JWT
const DELAY_MS = 700
const EPSILON = new Big('0.00000001')

if (!JWT) throw new Error('Set ONDO_JWT to a sandbox session token.')
if (BASE_URL !== SANDBOX_API) throw new Error('Authenticated invariant lab is sandbox-only.')

function asBig(value, label, violations) {
  try {
    const out = new Big(String(value))
    if (!Number.isFinite(Number(out.toString()))) throw new Error('not finite')
    return out
  } catch {
    violations.push({ type: 'invalid-numeric-field', label, value })
    return null
  }
}

function approxEqual(a, b) {
  return a.minus(b).abs().lte(EPSILON)
}

function checkBalance(balance, violations) {
  const wallet = asBig(balance.walletBalance, 'balance.walletBalance', violations)
  const unrealized = asBig(balance.unrealizedPnl, 'balance.unrealizedPnl', violations)
  const margin = asBig(balance.marginBalance, 'balance.marginBalance', violations)
  const used = asBig(balance.usedMargin, 'balance.usedMargin', violations)
  const available = asBig(balance.availableMargin, 'balance.availableMargin', violations)
  const withdrawable = asBig(balance.withdrawableMargin, 'balance.withdrawableMargin', violations)
  const maintenance = asBig(balance.maintenanceMarginRequirement, 'balance.maintenanceMarginRequirement', violations)

  if (wallet && unrealized && margin && !approxEqual(wallet.plus(unrealized), margin)) {
    violations.push({ type: 'margin-balance-equation', expected: wallet.plus(unrealized).toString(), actual: margin.toString() })
  }
  if (margin && used && available && !approxEqual(margin.minus(used), available)) {
    violations.push({ type: 'available-margin-equation', expected: margin.minus(used).toString(), actual: available.toString() })
  }
  if (withdrawable && available && withdrawable.gt(available.plus(EPSILON))) {
    violations.push({ type: 'withdrawable-exceeds-available', withdrawable: withdrawable.toString(), available: available.toString() })
  }
  if (used && used.lt(0)) violations.push({ type: 'negative-used-margin', value: used.toString() })
  if (maintenance && maintenance.lt(0)) violations.push({ type: 'negative-maintenance-margin', value: maintenance.toString() })
}

function checkPositions(positions, violations) {
  for (const [index, position] of positions.entries()) {
    const prefix = `positions[${index}]`
    const quantity = asBig(position.netQuantity, `${prefix}.netQuantity`, violations)
    const usedMargin = asBig(position.usedMargin, `${prefix}.usedMargin`, violations)
    const leverage = asBig(position.leverage, `${prefix}.leverage`, violations)
    const notional = asBig(position.notionalValue, `${prefix}.notionalValue`, violations)
    const maintenance = asBig(position.maintenanceMargin, `${prefix}.maintenanceMargin`, violations)

    if (!['long', 'short', 'neutral'].includes(position.direction)) {
      violations.push({ type: 'invalid-position-direction', index, value: position.direction })
    }
    if (quantity && quantity.lt(0)) violations.push({ type: 'negative-position-magnitude', index, value: quantity.toString() })
    if (usedMargin && usedMargin.lt(0)) violations.push({ type: 'negative-position-margin', index, value: usedMargin.toString() })
    if (maintenance && maintenance.lt(0)) violations.push({ type: 'negative-position-maintenance', index, value: maintenance.toString() })
    if (leverage && (leverage.lte(0) || leverage.gt(20))) {
      violations.push({ type: 'leverage-out-of-advertised-range', index, value: leverage.toString() })
    }
    if (notional && usedMargin && leverage && usedMargin.gt(0)) {
      const derived = notional.div(usedMargin)
      if (derived.minus(leverage).abs().gt('0.05')) {
        violations.push({ type: 'position-leverage-equation', index, derived: derived.toString(), reported: leverage.toString() })
      }
    }
  }
}

function checkOrders(orders, violations) {
  const ids = new Set()
  const clientIds = new Map()
  for (const [index, order] of orders.entries()) {
    if (ids.has(order.orderId)) violations.push({ type: 'duplicate-order-id', orderId: order.orderId })
    ids.add(order.orderId)

    const size = asBig(order.size, `orders[${index}].size`, violations)
    const filled = asBig(order.filledSize, `orders[${index}].filledSize`, violations)
    if (size && size.lte(0)) violations.push({ type: 'nonpositive-order-size', index, value: size.toString() })
    if (size && filled && (filled.lt(0) || filled.gt(size.plus(EPSILON)))) {
      violations.push({ type: 'filled-size-out-of-range', index, size: size.toString(), filled: filled.toString() })
    }
    if (!['open', 'fullyfilled', 'canceled', 'pending', 'untriggered'].includes(order.status)) {
      violations.push({ type: 'unknown-order-status', index, value: order.status })
    }
    if (order.clientOrderId) {
      const previous = clientIds.get(order.clientOrderId)
      if (previous && previous !== order.orderId) {
        violations.push({ type: 'client-order-id-maps-to-multiple-orders', clientOrderId: order.clientOrderId, orderIds: [previous, order.orderId] })
      }
      clientIds.set(order.clientOrderId, order.orderId)
    }
    if (!Number.isFinite(Date.parse(order.createdAt))) {
      violations.push({ type: 'invalid-order-created-at', index, value: order.createdAt })
    }
  }
}

async function authed(path) {
  return request({ baseUrl: BASE_URL, path, headers: bearer(JWT) })
}

async function main() {
  const evidence = {
    generatedAt: new Date().toISOString(),
    target: BASE_URL,
    safeguards: { readOnly: true, sandboxOnly: true, credentialPersisted: false },
    responses: {},
    violations: [],
  }

  const balanceResult = await authed('/v1/perps/balance')
  evidence.responses.balance = balanceResult
  await sleep(DELAY_MS)
  const positionsResult = await authed('/v1/perps/positions')
  evidence.responses.positions = positionsResult
  await sleep(DELAY_MS)
  const ordersResult = await authed('/v1/perps/orders?limit=100')
  evidence.responses.orders = ordersResult
  await sleep(DELAY_MS)
  const fillsResult = await authed('/v1/perps/fills?limit=100')
  evidence.responses.fills = fillsResult

  const balance = balanceResult.envelope?.result
  const positions = positionsResult.envelope?.result
  const orders = ordersResult.envelope?.result

  if (balance && typeof balance === 'object') checkBalance(balance, evidence.violations)
  else evidence.violations.push({ type: 'balance-unavailable', status: balanceResult.response?.status })

  if (Array.isArray(positions)) checkPositions(positions, evidence.violations)
  else evidence.violations.push({ type: 'positions-unavailable', status: positionsResult.response?.status })

  if (Array.isArray(orders)) checkOrders(orders, evidence.violations)
  else evidence.violations.push({ type: 'orders-unavailable', status: ordersResult.response?.status })

  evidence.summary = {
    violationCount: evidence.violations.length,
    manualReviewRequired: evidence.violations.length > 0,
    note: 'A failed arithmetic assertion is a candidate signal; reproduce across REST/WS and account history before reporting.',
  }
  console.log(await writeArtifact('invariant-lab', evidence))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
