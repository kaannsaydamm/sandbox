import { randomBytes } from 'node:crypto'
import { decodeJwt } from 'jose'
import { privateKeyToAccount } from 'viem/accounts'
import { SANDBOX_API, bearer, request, sleep, writeArtifact } from './lib/common.mjs'

const ALLOW_ACCOUNT_CREATE = process.argv.includes('--allow-account-create')
const BASE_URL = process.env.ONDO_API_URL ?? SANDBOX_API
const CHAIN_ID = process.env.ONDO_CHAIN_ID ?? '1'
const DELAY_MS = 800

if (BASE_URL !== SANDBOX_API) {
  throw new Error('SIWE state-changing checks are sandbox-only.')
}

const privateKey = process.env.ONDO_PRIVATE_KEY ?? `0x${randomBytes(32).toString('hex')}`
const account = privateKeyToAccount(privateKey)
const alternate = privateKeyToAccount(`0x${randomBytes(32).toString('hex')}`)

function parseSiwe(message) {
  const lines = String(message).split(/\r?\n/)
  const first = lines[0] ?? ''
  const address = lines[1]?.trim()
  const fields = Object.fromEntries(
    lines
      .map((line) => /^([^:]+):\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map((m) => [m[1].trim().toLowerCase(), m[2].trim()])
  )
  return {
    domain: first.replace(' wants you to sign in with your Ethereum account:', ''),
    address,
    uri: fields.uri,
    version: fields.version,
    chainId: fields['chain id'],
    nonce: fields.nonce,
    issuedAt: fields['issued at'],
    expirationTime: fields['expiration time'],
    notBefore: fields['not before'],
    requestId: fields['request id'],
  }
}

function validateChallenge(challenge) {
  const parsed = parseSiwe(challenge.message)
  const now = Date.now()
  const issuedAt = Date.parse(parsed.issuedAt)
  return {
    parsed,
    assertions: {
      domainExpected: parsed.domain === 'ondoperps.xyz',
      uriExpected: parsed.uri === 'https://ondoperps.xyz',
      addressBound: parsed.address?.toLowerCase() === account.address.toLowerCase(),
      chainBound: parsed.chainId === CHAIN_ID,
      noncePresent: typeof parsed.nonce === 'string' && parsed.nonce.length >= 8,
      issuedAtValid: Number.isFinite(issuedAt) && Math.abs(now - issuedAt) < 10 * 60_000,
      challengeIdPresent: typeof challenge.id === 'string' && challenge.id.length > 0,
    },
  }
}

async function complete(id, signature) {
  return request({
    baseUrl: BASE_URL,
    path: '/v1/auth/erc-4361/login/complete_challenge',
    method: 'POST',
    body: { id, signature },
  })
}

async function getChallenge(walletAddress = account.address, chainId = CHAIN_ID) {
  return request({
    baseUrl: BASE_URL,
    path: '/v1/auth/erc-4361/login/get_challenge',
    method: 'POST',
    body: { walletAddress, chainId },
  })
}

async function main() {
  const evidence = {
    generatedAt: new Date().toISOString(),
    target: BASE_URL,
    ephemeralAddress: account.address,
    safeguards: {
      generatedKeyNotPersisted: !process.env.ONDO_PRIVATE_KEY,
      accountCreationAllowed: ALLOW_ACCOUNT_CREATE,
      productionBlocked: true,
      requestsSequentialExceptExplicitReplay: true,
    },
    tests: [],
  }

  const challengeResponse = await getChallenge()
  evidence.tests.push({ name: 'get-valid-challenge', result: challengeResponse })
  const challenge = challengeResponse.envelope?.result
  if (!challenge?.id || !challenge?.message) {
    throw new Error('Sandbox did not return a usable SIWE challenge.')
  }
  evidence.challengeValidation = validateChallenge(challenge)

  const alternateSignature = await alternate.signMessage({ message: challenge.message })
  const wrongSigner = await complete(challenge.id, alternateSignature)
  evidence.tests.push({ name: 'wrong-signer-rejected', result: wrongSigner })
  await sleep(DELAY_MS)

  const validSignature = await account.signMessage({ message: challenge.message })
  const tampered = `${validSignature.slice(0, -2)}${validSignature.endsWith('00') ? '01' : '00'}`
  const tamperedSignature = await complete(challenge.id, tampered)
  evidence.tests.push({ name: 'tampered-signature-rejected', result: tamperedSignature })
  await sleep(DELAY_MS)

  const secondChallengeResponse = await getChallenge()
  const secondChallenge = secondChallengeResponse.envelope?.result
  evidence.tests.push({ name: 'get-second-challenge', result: secondChallengeResponse })
  if (secondChallenge?.id && secondChallenge?.message) {
    const firstSignatureAgainstSecondId = await complete(secondChallenge.id, validSignature)
    evidence.tests.push({ name: 'cross-challenge-signature-rejected', result: firstSignatureAgainstSecondId })
  }

  if (!ALLOW_ACCOUNT_CREATE) {
    evidence.verdict = 'Negative-binding probes completed. Valid login/replay skipped without --allow-account-create.'
    console.log(await writeArtifact('siwe-lab', evidence))
    return
  }

  await sleep(DELAY_MS)
  const fresh = await getChallenge()
  const freshChallenge = fresh.envelope?.result
  if (!freshChallenge?.id || !freshChallenge?.message) throw new Error('Fresh challenge unavailable.')
  const freshSignature = await account.signMessage({ message: freshChallenge.message })
  const login = await complete(freshChallenge.id, freshSignature)
  evidence.tests.push({ name: 'valid-login', result: login })

  const token = login.envelope?.result?.token
  if (typeof token === 'string') {
    try {
      const payload = decodeJwt(token)
      evidence.jwt = {
        payloadKeys: Object.keys(payload).sort(),
        issuer: payload.iss,
        audience: payload.aud,
        subject: payload.sub,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
        accountIdClaimPresent: 'accountId' in payload || 'account_id' in payload,
        identifierClaimPresent: 'identifier' in payload || 'address' in payload || 'sub' in payload,
      }
    } catch (error) {
      evidence.jwt = { decodeError: String(error?.message ?? error) }
    }
  }

  await sleep(DELAY_MS)
  const replay = await complete(freshChallenge.id, freshSignature)
  evidence.tests.push({ name: 'consumed-challenge-replay-rejected', result: replay })

  if (typeof token === 'string') {
    const accountRead = await request({ baseUrl: BASE_URL, path: '/v1/account', headers: bearer(token) })
    evidence.tests.push({ name: 'issued-jwt-account-read', result: accountRead })

    const parts = token.split('.')
    if (parts.length === 3) {
      const changedPayload = `${parts[0]}.${parts[1].slice(0, -1)}${parts[1].endsWith('A') ? 'B' : 'A'}.${parts[2]}`
      const tamperedJwtRead = await request({ baseUrl: BASE_URL, path: '/v1/account', headers: bearer(changedPayload) })
      evidence.tests.push({ name: 'tampered-jwt-rejected', result: tamperedJwtRead })
    }
  }

  evidence.verdict = 'Review response statuses: all malformed/cross/replay probes should fail; valid login should be the only success.'
  console.log(await writeArtifact('siwe-lab', evidence))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
