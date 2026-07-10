# Ondo Perps Authorized Test Matrix

This document contains hypotheses and falsification gates, not vulnerability disclosures. Raw evidence, credentials, account identifiers, and unreported findings stay outside this public repository.

## Scope lock

- Production scope: `ondoperps.xyz`, `app.ondoperps.xyz`, `api.ondoperps.xyz`.
- State-changing probes: published sandbox only.
- Production probes: public/read-only and low volume only.
- No third-party accounts, data extraction, service disruption, high-volume scanning, or testing beyond the minimum needed to prove impact.

## Severity gate

A response difference is not automatically a finding. Promotion requires a repeatable violation plus concrete impact:

- **Critical/High gate:** unauthorized asset movement, duplicate execution, solvency/accounting failure, cross-account control, liquidation bypass, or systemic trading integrity failure.
- **Medium gate:** durable unauthorized state mutation, meaningful account lockout, security-control bypass with practical consequence, or bounded financial loss.
- **Low gate:** narrow integrity issue with demonstrable effect.
- Header differences, verbose errors, unsupported methods, and validation-order differences without impact are informational only.

## Priority A — authentication and session integrity

| ID | Hypothesis | Safe probe | Expected invariant | Promotion gate |
|---|---|---|---|---|
| AUTH-01 | SIWE challenge can be completed by a different signer | Sign challenge with a second ephemeral wallet | Rejected | JWT issued to wrong signer |
| AUTH-02 | Signature is not bound to challenge ID | Submit signature from challenge A with challenge B ID | Rejected | JWT issued |
| AUTH-03 | Consumed challenge can be replayed | Complete once, repeat exact pair | Second request rejected | Multiple valid sessions or account state mutation |
| AUTH-04 | Challenge is not bound to wallet address | Inspect message; sign a message containing another address | Address must equal requested/signer address | JWT identity mismatch |
| AUTH-05 | Challenge is not bound to chain ID | Request supported chain, tamper signed message/chain | Rejected | Cross-chain login accepted |
| AUTH-06 | Challenge domain/URI mismatch permits phishing reuse | Validate ERC-4361 domain and URI exactly | Both Ondo origins | Valid token from foreign domain/URI message |
| AUTH-07 | Challenge lifetime is excessive or missing | Measure issued-at/expiry; retry after bounded delay | Short, enforced lifetime | Expired challenge accepted |
| AUTH-08 | JWT signature/payload tampering accepted | Flip one payload byte, retain signature | 401/403 | Private endpoint returns data |
| AUTH-09 | JWT identity fields disagree with account endpoint | Decode non-secret claims, compare own account | Identifier/account ID consistent | Cross-identity data/control |
| AUTH-10 | Server-revoked JWT remains valid on REST | Revoke own session, read own endpoint | Rejected after revocation | Continued trading/withdrawal authority |
| AUTH-11 | Server-revoked JWT remains valid on existing WS | Revoke own session while private WS is open | Private stream closes/stops | Continued private data or state authority |
| AUTH-12 | One WS connection can switch identity | Login A then login B on same socket | Second login rejected | B data delivered on A-bound socket |
| AUTH-13 | Private WS subscription works before login | Subscribe to own private channel anonymously | Rejected/no data | Any account frame received |
| AUTH-14 | Environment confusion accepts prod token in sandbox or inverse | Present token to opposite environment | Rejected | Cross-environment authority |

## Priority A — order and margin state machine

| ID | Hypothesis | Safe sandbox probe | Expected invariant | Promotion gate |
|---|---|---|---|---|
| ORD-01 | Concurrent identical `clientOrderId` creates two orders | Two simultaneous post-only orders, same payload and client ID | One order or deterministic duplicate rejection | Distinct accepted orders plus execution/reservation effect |
| ORD-02 | Serial duplicate `clientOrderId` creates a second order | Repeat exact accepted request | Original returned or duplicate rejected | Second live/executed order |
| ORD-03 | Concurrent orders over-reserve available margin | Two bounded post-only orders near remaining capacity | Aggregate reservation cannot exceed available margin | Negative/free margin inconsistency or excess accepted exposure |
| ORD-04 | Cancel and fill race produces inconsistent terminal state | Own tiny sandbox order; cancel near controlled match condition | One terminal outcome, conserved balances | Fill and cancel side effects both applied |
| ORD-05 | Concurrent double-cancel applies duplicate effects | Cancel same own order twice simultaneously | One success, one idempotent/no-op/reject | Duplicate refund, fee, or margin release |
| ORD-06 | Leverage update races order placement | Bounded own account, two requests | One coherent leverage/exposure calculation | Exposure exceeds limit or wrong liquidation parameters |
| ORD-07 | `reduceOnly` can increase or flip exposure | Reduce-only order larger than own position | Capped/rejected; never expands | Position magnitude grows/flips |
| ORD-08 | `closePosition` and explicit size conflict | Own position only, contradictory bounded payload | Rejected or closes exactly | Excess position or unexpected opposite exposure |
| ORD-09 | TP/SL parent-child linkage can orphan executable orders | Create/cancel own bracket order | Children canceled/disabled consistently | Orphan child executes against absent parent |
| ORD-10 | Two TP/SL children can both execute | Controlled own position on sandbox | OCO behavior or bounded reduce-only | Double close / position flip |
| ORD-11 | IOC/post-only combination has inconsistent behavior | Small safe payload | Deterministic reject or documented behavior | Unexpected execution/fees outside stated semantics |
| ORD-12 | `quoteSize` and `size` disagreement chooses attacker-favorable field | Contradictory safe payload | Rejected | Executed quantity/cost differs from confirmed order |
| ORD-13 | Precision rounding crosses risk or price limit | Tick/lot boundary values | Deterministic venue grid rounding/reject | Execution beyond submitted bound |
| ORD-14 | Negative, zero, NaN-like, exponent or huge numeric strings bypass validation | Invalid-body only | Rejected before state mutation | Accepted order/state corruption |
| ORD-15 | Unknown fields override canonical fields during decoding | Duplicate/shadow field names in sandbox invalid probe | Unknown fields ignored/rejected | Hidden field changes account/order identity |
| ORD-16 | Batch partial failure is non-atomic in an unsafe way | Only if batch endpoint is confirmed; bounded invalid+valid pair | Documented atomicity or explicit per-item result | Unexpected live order after caller sees batch failure |

## Priority A — authorization and API-key scope

| ID | Hypothesis | Safe probe | Expected invariant | Promotion gate |
|---|---|---|---|---|
| ACL-01 | Anonymous request reaches business validation before auth | Invalid private requests without credential | 401/403 before sensitive behavior | State mutation/data leak |
| ACL-02 | Read-only/no-scope API key can trade | Invalid order first; valid only in owned sandbox after explicit approval | Trade scope required | Accepted live order |
| ACL-03 | Trade-only key can withdraw | Empty/invalid withdraw first | Transfer scope required | Withdrawal accepted |
| ACL-04 | Transfer-only key can trade | Invalid order | Trade scope required | Accepted live order |
| ACL-05 | API-key scope changes do not invalidate cached authorization | Modify own key scopes; reuse old credential | New scopes enforced immediately | Retained revoked privilege |
| ACL-06 | Deleted API key remains usable on REST | Delete own test key; retry read/write | Rejected | Continued privileged operation |
| ACL-07 | Deleted API key remains usable on WS | Authenticate own socket, delete key if WS supports key auth | Session invalidated or correctly independent | Undocumented retained privileged authority |
| ACL-08 | JWT can manage API keys without required recent authentication | Own account only | Documented re-auth/security gate | Silent key creation with stolen stale session and material impact |
| ACL-09 | Header ambiguity changes selected credential | Duplicate/case-varied auth headers via controlled client | Reject ambiguity | Lower-privilege request interpreted as higher privilege |
| ACL-10 | Path/query normalization bypasses route scope middleware | Benign variants only | Same authorization result | Restricted operation succeeds |

## Priority B — REST/WS consistency

| ID | Hypothesis | Safe probe | Expected invariant | Promotion gate |
|---|---|---|---|---|
| SYNC-01 | REST order terminal state differs durably from WS | Own order lifecycle | Eventual convergence | Trading decision/state control based on wrong durable state |
| SYNC-02 | Reconnect replays stale private frames as current | Disconnect/reconnect own socket | Snapshot/replay clearly ordered | Duplicate state transition or false live order |
| SYNC-03 | Sequence gaps are not detectable | Record bounded frames and timestamps | Snapshot or sequence recovery | Silent omission causes persistent wrong position/order state |
| SYNC-04 | Market filter leaks other market/account data | Subscribe one public market/private account | Only requested public market; own private account | Cross-account private frame |
| SYNC-05 | Unsubscribe race keeps private stream alive | Subscribe/unsubscribe own channel | No later private frames except in-flight bounded event | Durable unauthorized post-unsubscribe delivery |
| SYNC-06 | Token expiry is enforced differently on REST and WS | Wait around own short-lived token expiry | Both reject/reauth consistently | Expired WS retains sensitive authority |

## Priority B — accounting and liquidation integrity

| ID | Hypothesis | Safe probe | Expected invariant | Promotion gate |
|---|---|---|---|---|
| ACCT-01 | `marginBalance != walletBalance + unrealizedPnl` | Read own account repeatedly | Equality within documented precision | Persistent mismatch with withdrawal/trading consequence |
| ACCT-02 | `availableMargin != marginBalance - usedMargin` | Read own account | Equality within precision | Excess trading/withdrawal capacity |
| ACCT-03 | Withdrawable margin exceeds available margin | Read only, then minimum sandbox validation if available | `withdrawable <= available` | Excess withdrawal accepted |
| ACCT-04 | Sum of position margins disagrees with account used margin | Own positions | Reconciles under documented add-ons | Excess leverage or trapped margin |
| ACCT-05 | Filled size exceeds order size | Read own history | `0 <= filled <= size` | Duplicate execution/accounting |
| ACCT-06 | Funding is applied twice around reconnect/cursor boundaries | Compare own history and balance | Each interval once | Duplicate debit/credit |
| ACCT-07 | Composite cursor skips/duplicates liquidation/funding records | Read bounded pages | Stable complete traversal | Financial history/account balance discrepancy |
| ACCT-08 | Liquidation can be bypassed by cancel/leverage/update race | Only controlled funded sandbox account | Risk checks serialize correctly | Insolvent exposure or insurance loss |
| ACCT-09 | Mark-price and liquidation-price calculations use inconsistent snapshots | Compare same-time REST/WS own position | Bounded temporal difference | Forced/avoided liquidation with reproducible financial impact |

## Priority C — browser and integration boundary

| ID | Hypothesis | Safe probe | Expected invariant | Promotion gate |
|---|---|---|---|---|
| WEB-01 | JWT in browser storage is exposed to unrelated origins | Static/runtime browser inspection | Same-origin only; strong CSP | Practical cross-origin theft chain |
| WEB-02 | App accepts untrusted backend-built REST action path | Inspect action descriptors and client execution | Strict allowlist/base-origin binding | Credentialed call redirected to attacker origin or unintended in-scope route |
| WEB-03 | Action body shown to user differs from body executed | Compare own sandbox confirmation and request | Exact semantic match | Hidden order/risk parameter mutation |
| WEB-04 | Open redirect or callback confusion leaks session material | Non-auth navigation only | No credential in URL/referrer | Token/signature leak to external origin |
| WEB-05 | Service worker/cache serves one user's private response to another | Separate local browser profiles, own accounts only | Private responses non-cacheable and partitioned | Cross-account private data |

## Execution order

1. Run public recon and record endpoint/CORS/security-header shape.
2. Run SIWE negative binding probes with a generated empty wallet.
3. With explicit approval, complete one sandbox login and test challenge replay/JWT integrity.
4. Run private read authorization matrix and accounting invariants.
5. Run bounded WS anonymous/invalid/valid/reconnect probes.
6. Configure a market, tiny lot and demonstrably non-marketable post-only price; run duplicate-ID and double-cancel tests.
7. Promote only reproducible signals with concrete impact; otherwise mark the hypothesis falsified or inconclusive.

## Evidence discipline

Each run writes a redacted JSON artifact under `artifacts/` (gitignored). A submission package must separately include exact UTC time, environment, request/response pair, cleanup result, account-state deltas, impact proof, and a minimal reproduction. Never commit JWTs, signatures, private keys, API secrets, full HAR files, or unreported exploit details.
