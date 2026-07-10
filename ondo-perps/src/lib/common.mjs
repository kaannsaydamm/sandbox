import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const PROD_API = 'https://api.ondoperps.xyz'
export const SANDBOX_API = 'https://api.ondoperps-sandbox.xyz'
export const PROD_WS = 'wss://api.ondoperps.xyz/ws'
export const SANDBOX_WS = 'wss://api.ondoperps-sandbox.xyz/ws'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function redact(value, key = '') {
  const sensitive = /(authorization|cookie|token|signature|secret|private|jwt|api.?key)/i.test(key)
  if (sensitive && value !== undefined && value !== null) return '[REDACTED]'
  if (Array.isArray(value)) return value.map((v) => redact(v))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]))
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}...[TRUNCATED]`
  return value
}

export function parseEnvelope(data) {
  if (!data || typeof data !== 'object') return { success: false, result: undefined, raw: data }
  return {
    success: data.success === true,
    result: data.result,
    error: data.error ?? data.message,
    errorCode: data.error_code,
    raw: data,
  }
}

export async function request({
  baseUrl,
  path,
  method = 'GET',
  body,
  headers = {},
  timeoutMs = 10000,
  redirect = 'manual',
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      signal: controller.signal,
      redirect,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'ondo-perps-authorized-research/0.2',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    let data
    try { data = text === '' ? null : JSON.parse(text) } catch { data = text }
    return {
      request: redact({ baseUrl, path, method, body, headers }),
      response: {
        status: response.status,
        statusText: response.statusText,
        durationMs: Date.now() - startedAt,
        headers: Object.fromEntries([...response.headers.entries()].filter(([k]) =>
          /^(access-control|cache-control|content-security|strict-transport|x-|server|via|cf-)/i.test(k)
        )),
        body: redact(data),
      },
      data,
      envelope: parseEnvelope(data),
    }
  } catch (error) {
    return {
      request: redact({ baseUrl, path, method, body, headers }),
      error: { name: error?.name ?? 'Error', message: String(error?.message ?? error), durationMs: Date.now() - startedAt },
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function writeArtifact(name, value) {
  const dir = resolve('artifacts')
  await mkdir(dir, { recursive: true })
  const path = resolve(dir, `${name}-${Date.now()}.json`)
  await writeFile(path, `${JSON.stringify(redact(value), null, 2)}\n`, 'utf8')
  return path
}

export function requireSandbox(baseUrl, allowProductionRead = false) {
  if (baseUrl === SANDBOX_API) return
  if (allowProductionRead && baseUrl === PROD_API) return
  throw new Error(`Refusing target: ${baseUrl}. State-changing probes are sandbox-only.`)
}

export function bearer(token) {
  return { Authorization: `Bearer ${token}` }
}

export function apiKeyHeaders(id, secret) {
  return { 'X-API-KEY-ID': id, Authorization: `Bearer ${secret}` }
}
