import WebSocket from 'ws'
import { SANDBOX_WS, redact, sleep, writeArtifact } from './lib/common.mjs'

const WS_URL = process.env.ONDO_WS_URL ?? SANDBOX_WS
const JWT = process.env.ONDO_JWT
const MARKET = process.env.ONDO_MARKET
const FRAME_TIMEOUT_MS = 5000
const MAX_FRAMES = 8

if (!WS_URL.includes('ondoperps-sandbox.xyz')) {
  throw new Error('WebSocket auth probes are sandbox-only. Override ONDO_WS_URL only with the published sandbox.')
}

function openSocket(label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: { 'User-Agent': 'ondo-perps-authorized-research/0.2' },
    })
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error(`${label}: open timeout`))
    }, FRAME_TIMEOUT_MS)
    ws.once('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function capture(ws, label, actions) {
  return new Promise((resolve) => {
    const frames = []
    let closed = false
    const finish = (reason) => {
      if (closed) return
      closed = true
      clearTimeout(timer)
      try { ws.close(1000, 'authorized-lab-complete') } catch {}
      resolve({ label, reason, frames: redact(frames) })
    }
    const timer = setTimeout(() => finish('timeout'), FRAME_TIMEOUT_MS)
    ws.on('message', (raw) => {
      let parsed
      try { parsed = JSON.parse(raw.toString()) } catch { parsed = raw.toString() }
      frames.push(parsed)
      if (frames.length >= MAX_FRAMES) finish('frame-cap')
    })
    ws.on('close', (code, reason) => finish(`closed:${code}:${reason.toString()}`))
    ws.on('error', (error) => finish(`error:${error.message}`))
    Promise.resolve(actions(ws)).catch((error) => {
      frames.push({ localActionError: error.message })
      finish('local-action-error')
    })
  })
}

async function publicProbe() {
  const ws = await openSocket('public')
  return capture(ws, 'public-ping-and-market-context', async (socket) => {
    socket.send(JSON.stringify({ op: 'ping' }))
    socket.send(JSON.stringify({ op: 'subscribe', channel: 'markPricesPerps' }))
    socket.send(JSON.stringify({ op: 'subscribe', channel: 'fundingRatesPerps' }))
    if (MARKET) {
      socket.send(JSON.stringify({ op: 'subscribe', channel: 'depthBooksPerps', markets: [MARKET] }))
    }
  })
}

async function privateBeforeLoginProbe() {
  const ws = await openSocket('private-before-login')
  return capture(ws, 'private-subscribe-before-login', async (socket) => {
    socket.send(JSON.stringify({ op: 'subscribe', channel: 'ordersPerps' }))
  })
}

async function invalidLoginProbe() {
  const ws = await openSocket('invalid-login')
  return capture(ws, 'tampered-jwt-login', async (socket) => {
    socket.send(JSON.stringify({ op: 'login', args: { token: 'invalid.authorized-lab.token' } }))
    await sleep(250)
    socket.send(JSON.stringify({ op: 'subscribe', channel: 'positionsPerps' }))
  })
}

async function validLoginProbe() {
  const ws = await openSocket('valid-login')
  return capture(ws, 'valid-login-private-channels-and-second-login', async (socket) => {
    socket.send(JSON.stringify({ op: 'login', args: { token: JWT } }))
    await sleep(300)
    socket.send(JSON.stringify({ op: 'subscribe', channel: 'ordersPerps' }))
    socket.send(JSON.stringify({ op: 'subscribe', channel: 'fillsPerps' }))
    socket.send(JSON.stringify({ op: 'subscribe', channel: 'positionsPerps' }))
    await sleep(300)
    socket.send(JSON.stringify({ op: 'login', args: { token: JWT } }))
  })
}

async function reconnectProbe() {
  const first = await openSocket('reconnect-first')
  const firstResult = await capture(first, 'first-connection-login', async (socket) => {
    socket.send(JSON.stringify({ op: 'login', args: { token: JWT } }))
    socket.send(JSON.stringify({ op: 'subscribe', channel: 'positionsPerps' }))
  })
  const second = await openSocket('reconnect-second')
  const secondResult = await capture(second, 'second-connection-same-token', async (socket) => {
    socket.send(JSON.stringify({ op: 'login', args: { token: JWT } }))
    socket.send(JSON.stringify({ op: 'subscribe', channel: 'positionsPerps' }))
  })
  return { firstResult, secondResult }
}

async function main() {
  const evidence = {
    generatedAt: new Date().toISOString(),
    target: WS_URL,
    safeguards: {
      sandboxOnly: true,
      maxFramesPerProbe: MAX_FRAMES,
      timeoutMs: FRAME_TIMEOUT_MS,
      noTradingFrames: true,
      tokenPersisted: false,
    },
    probes: [],
  }

  evidence.probes.push(await publicProbe())
  await sleep(700)
  evidence.probes.push(await privateBeforeLoginProbe())
  await sleep(700)
  evidence.probes.push(await invalidLoginProbe())

  if (JWT) {
    await sleep(700)
    evidence.probes.push(await validLoginProbe())
    await sleep(700)
    evidence.reconnect = await reconnectProbe()
  }

  evidence.review = [
    'Private subscriptions before login and after invalid login must not yield account data.',
    'A second login on one connection should reject or remain bound to the first identity.',
    'A fresh connection may require a fresh login even when the JWT is still valid.',
    'Any private data in anonymous/invalid probes is a critical manual-review signal.',
  ]
  console.log(await writeArtifact('ws-lab', evidence))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
