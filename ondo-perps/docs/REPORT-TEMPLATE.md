# Ondo Perps Finding — Working Template

> Keep this file generic in the public repository. Copy it outside the repo for an actual finding and insert private evidence there.

## Metadata

- Candidate ID:
- Title:
- Target asset:
- Environment used for validation:
- First observed (UTC):
- Last reproduced (UTC):
- Proposed severity:
- Status: `candidate` / `impact-proven` / `submit-ready` / `falsified`

## Executive summary

Describe the violated security invariant, the attacker capability, and the concrete effect in three to five sentences. Avoid speculative impact.

## Security invariant

State what must always remain true, for example:

- one authenticated identity controls only its own account;
- one client order identifier cannot produce multiple economically active orders;
- available margin cannot be reserved or spent more than once;
- an expired or revoked credential cannot authorize REST or WebSocket operations.

## Preconditions

List only conditions actually required by the reproduction:

- account state and funding;
- credential type and scope;
- market state;
- timing/concurrency window;
- whether a victim action is required.

## Minimal reproduction

1. Establish the controlled research account and record the pre-state.
2. Send the minimum request sequence required to trigger the issue.
3. Record exact HTTP status, machine error code, order/transaction identifiers, and UTC timestamps.
4. Read the post-state using an independent endpoint/channel.
5. Stop testing once the impact is demonstrated.
6. Run cleanup and record whether cleanup succeeded.

Do not include live credentials or third-party account data.

## Expected result

Describe the correct authorization, idempotency, state-transition, accounting, or session behavior.

## Actual result

Describe the repeatable deviation. Distinguish transport success from business success and API acknowledgement from durable state.

## Impact proof

Quantify the effect using measured deltas:

- balances/margin before and after;
- number of economically active orders;
- filled quantity and fees;
- unauthorized account/state affected;
- duration and recoverability;
- maximum realistic funds or users at risk.

A response discrepancy without a durable or security-relevant effect is not sufficient.

## False-positive gates completed

- [ ] Reproduced at least twice with fresh identifiers.
- [ ] Confirmed against current program scope and rules.
- [ ] Confirmed not already public/known/duplicate.
- [ ] Confirmed the effect is server-side, not only SDK/UI behavior.
- [ ] Confirmed only owned accounts were used.
- [ ] Confirmed cleanup or documented why cleanup was impossible.
- [ ] Confirmed the issue persists after independent state reads.
- [ ] Tested reasonable benign/product-intended explanation.
- [ ] Severity matches Cantina's concrete impact definitions.

## Root cause hypothesis

Identify the narrowest likely failure point without overclaiming access to server source code: authorization middleware ordering, missing uniqueness constraint, transaction isolation, cache invalidation, session revocation propagation, or state-machine transition validation.

## Suggested remediation

Recommend an invariant-level fix and regression tests. Examples:

- enforce a unique `(account_id, client_order_id)` constraint in the same transaction as order creation;
- reserve margin atomically with order acceptance;
- revalidate credential status on private WS subscription and periodically after login;
- bind SIWE challenge ID, nonce, address, domain, URI, chain ID, and expiry in one single-use server record.

## Evidence inventory

Keep exact private file names and hashes outside this public repository:

- redacted request/response transcript;
- account state snapshots;
- WS frame timeline;
- cleanup transcript;
- screen recording if necessary;
- minimal PoC script;
- SHA-256 hashes of all evidence files.
