import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PROD = 'https://api.ondoperps.xyz'
const SANDBOX = 'https://api.ondoperps-sandbox.xyz'
const AUTH_RECON = process.argv.includes('--auth-recon')
const RESEARCH_ADDRESS = process.env.ONDO_RESEARCH_ADDRESS
const DELAY_MS = 700
const TIMEOUT_MS = 10_000

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

function redact(value, key = '') {
  const sensitive = /(token|authorization|cookie|signature|secret|private|jwt)/i.test(key)
  if (sensitive && value !== undefined && value !== null) return '[REDACTED]'
  if (Array.isArray(value)) return value.map((item) => redact(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)])
    )
  }
  if (typeof value === 'string' && value.length > 2_000) return `${value.slice(0, 2_000)}...[TRUNCATED]`
  return value
}

async function request({ baseUrl, path, method = 'GET', body, headers = {} }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'ondo-perps-authorized-research/0.1',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const text = await response.text()
    let parsedBody
    try {
      parsedBody = text === '' ? null : JSON.parse(text)
    } catch {
      parsedBody = text
    }

    const selectedHeaders = {}
    for (const name of [
      'access-control-allow-origin',
      'access-control-allow-credentials',
      'access-control-allow-methods',
      'access-control-allow-headers',
      'content-security-policy',
      'strict-transport-security',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'server',
      'via',
      'cf-ray',
    ]) {
      const value = response.headers.get(name)
      if (value !== null) selectedHeaders[name] = value
    }

    return {
      request: { baseUrl, path, method, body: redact(body) },
      response: {
        status: response.status,
        statusText: response.statusText,
        durationMs: Date.now() - startedAt,
        headers: selectedHeaders,
        body: redact(parsedBody),
      },
    }
  } catch (error) {
    return {
      request: { baseUrl, path, method, body: redact(body) },
      error: {
        name: error?.name ?? 'Error',
        message: String(error?.message ?? error),
        durationMs: Date.now() - startedAt,
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const tests = [
    { baseUrl: PROD, path: '/' },
    { baseUrl: PROD, path: '/openapi.json' },
    { baseUrl: PROD, path: '/v1/providers' },
    { baseUrl: PROD, path: '/v1/perps/markets' },
    { baseUrl: PROD, path: '/v1/perps/orders', method: 'OPTIONS' },
    { baseUrl: PROD, path: '/v1/auth/erc-4361/login/get_challenge', method: 'OPTIONS' },
    { baseUrl: SANDBOX, path: '/' },
    { baseUrl: SANDBOX, path: '/openapi.json' },
    { baseUrl: SANDBOX, path: '/v1/providers' },
    { baseUrl: SANDBOX, path: '/v1/perps/markets' },
    { baseUrl: SANDBOX, path: '/v1/perps/orders', method: 'OPTIONS' },
    { baseUrl: SANDBOX, path: '/v1/auth/erc-4361/login/get_challenge', method: 'OPTIONS' },
  ]

  if (AUTH_RECON) {
    if (!RESEARCH_ADDRESS || !/^0x[a-fA-F0-9]{40}$/.test(RESEARCH_ADDRESS)) {
      throw new Error('Set ONDO_RESEARCH_ADDRESS to a fresh, empty EVM address before --auth-recon.')
    }
    tests.push({
      baseUrl: SANDBOX,
      path: '/v1/auth/erc-4361/login/get_challenge',
      method: 'POST',
      body: { walletAddress: RESEARCH_ADDRESS, chainId: '1' },
    })
  }

  const results = []
  for (const test of tests) {
    results.push(await request(test))
    await sleep(DELAY_MS)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: AUTH_RECON ? 'sandbox-auth-shape' : 'public-read-only',
    safeguards: {
      sequential: true,
      delayMs: DELAY_MS,
      timeoutMs: TIMEOUT_MS,
      credentialsPersisted: false,
      writesAttempted: false,
    },
    results,
  }

  const artifactsDir = resolve('artifacts')
  await mkdir(artifactsDir, { recursive: true })
  const filename = resolve(artifactsDir, `recon-${Date.now()}.json`)
  await writeFile(filename, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(`Wrote redacted report: ${filename}`)
  for (const item of results) {
    const status = item.response?.status ?? item.error?.name ?? 'unknown'
    console.log(`${item.request.method} ${item.request.baseUrl}${item.request.path} -> ${status}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
