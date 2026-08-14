# Third-Party REST Integration (M11)

`target-stack.md` requires real experience integrating a third-party REST API: auth, rate
limits, retries with backoff, idempotency. M11 built this as an outbound signed webhook that
pushes experiment results out — `apps/api/src/features/push-results/`.

## Why not literally Slack

`milestones.md`'s M11 bullet originally suggested pushing results to a Slack webhook as the
concrete example. The developer declined creating a real Slack account, so M11 built a
generic signed-webhook sender instead, verified live against
[webhook.site](https://webhook.site) — a free, no-signup public capture URL, not a mocked
substitute. The retry/auth/idempotency skill being trained doesn't depend on the target being
Slack specifically; a real HTTP POST with real signing and real retry logic exercises the same
skill regardless of what's on the other end.

## Trigger: manual endpoint, not auto-fire on completion

`POST /projects/:projectId/experiments/:id/results/push` is operator-triggered, not wired into
`ManageExperimentsService.update()`'s `status: 'completed'` transition. The reason is
structural, not stylistic: `PushResultsModule` needs `GetResultsService`, and
`GetResultsModule` already imports `ManageExperimentsModule`. Hooking into
`ManageExperimentsService.update()` would make `ManageExperimentsModule` import
`PushResultsModule` right back — a real `forwardRef()` cycle between two modules that have no
business depending on each other. It would also block a `PATCH` request on up to ~7 seconds of
retry backoff with no good failure story: either fail the whole status transition because a
webhook was down, or silently swallow the delivery error.

The correct way to wire this later is the same shape M10 already built: a status update
publishes an event, a consumer (this feature, or a new one) does the HTTP call
asynchronously. That's RabbitMQ machinery again, which would make M11 about messaging instead
of REST — deliberately out of scope here, recorded as a natural M12+ follow-up.

## Auth: HMAC-SHA256 signing, not a bearer token

Every request carries:

| Header | Value |
|---|---|
| `X-SplitLab-Timestamp` | unix seconds at send time |
| `X-SplitLab-Idempotency-Key` | see below |
| `X-SplitLab-Signature` | `sha256=<hex>` = `HMAC_SHA256(secret, "{timestamp}.{rawBody}")` |

A bearer token only proves the caller knows a secret. HMAC over the body *and* a timestamp
does two more things a bearer token can't: it integrity-protects the payload (tampering breaks
the signature), and it makes replay detectable (a receiver can reject requests whose timestamp
is too old, though this project's own code doesn't implement that check — webhook.site
wouldn't verify it either way). The body is serialized to a string exactly once
(`JSON.stringify`) and that exact string is both signed and sent — signing an object and
letting the HTTP layer re-serialize it before sending is a classic way this silently breaks
(different whitespace/key order produces different bytes than what got signed).

## Retry / backoff — real exponential, not M10's flat schedule

`results-webhook.client.ts`: 4 attempts total (1 + 3 retries), true exponential backoff
(1s / 2s / 4s). This deliberately does **not** match M10's RabbitMQ retry shape (flat 5s × 3
cycles) — that flat shape came from a RabbitMQ-specific constraint (one TTL per dead-letter
retry queue, documented in `messaging.md`), not a general preference for flat delays. A
synchronous HTTP call has no such constraint, so exponential backoff — the more realistic
pattern for this milestone's actual skill — is free to use here.

Classification:
- Retry: no response at all (network/DNS/timeout), `408`, `429`, any `5xx`.
- Never retry: any other `4xx` (bad signature, bad payload, bad URL) — these are permanent,
  retrying them wastes attempts and delays the caller for no benefit.
- `429` specifically: honor `Retry-After` (seconds or HTTP-date form) if present, capped at
  30 seconds so a hostile or misconfigured header can't stall a request thread indefinitely.
  Missing or unparseable falls back to the normal exponential schedule.

The idempotency key is computed once per `send()` call and reused across all 4 attempts — a
fresh key per retry would defeat the receiver-side dedupe the key exists for.

## Idempotency: content-derived key, not a random one

```
idempotencyKey = sha256(experimentId + ":" + JSON.stringify(results, sorted by variantId))
```

This is deterministic on purpose: the same experiment with the same numbers always hashes to
the same key, so an operator clicking "push results" twice on unchanged data never sends
twice — the second call returns `{ status: 'duplicate' }` with **zero network calls**. A
random key generated fresh per click would only catch duplicates *within* one retry loop
(already handled — the key is computed once and reused across the 4 attempts), not an operator
manually re-triggering the same push. This would be the wrong choice for a different kind of
event — logging two genuinely separate user actions that happen to produce identical payloads
should count as two events, not one — but a "push these results" call is a snapshot, and
"identical numbers never deliver twice, changed numbers always do" is the right semantics for
a snapshot.

`getResults()` (`get-results.service.ts`) has no `ORDER BY` on its variant query, so row order
isn't guaranteed — the hash sorts results by `variantId` itself before hashing, or the same
underlying data could hash two different ways depending on what order Postgres happened to
return rows in.

The `webhook_deliveries.idempotencyKey` **unique constraint** — not the `SELECT` that follows
a failed insert — is what actually closes the race between two concurrent pushes for the same
content. `insert(...).onConflictDoNothing().returning()`: a row comes back only if this
request's insert really was the first; nothing coming back means some request (this one or a
concurrent one) already owns that key, so the code falls back to looking up the existing row
instead of assuming it's safe to send. A plain "check if it exists, then insert" without the
constraint would have a real gap under concurrency — two requests could both pass the check
before either inserts.

## HTTP client: native `fetch`, not axios

Originally planned as `@nestjs/axios` (matches the DI-registration shape already used for the
RabbitMQ client). Changed mid-implementation to Node 20's native `fetch`: zero new
dependencies, `fetch` never throws on 4xx/5xx either (same manual status-check need as axios's
`validateStatus: () => true`), and `AbortSignal.timeout()` covers the timeout axios's
`timeout` option gave for free. To keep the same DI-mockable shape every other spec in this
repo uses, `fetch` is wrapped behind a `WEBHOOK_HTTP` token rather than called directly — see
`nestjs-concepts.md`'s "Custom tokens, second use case" section for why that wrapping is
necessary at all.

## Testing

Automated (`results-webhook.client.spec.ts`, `push-results.service.spec.ts`,
`webhook.config.spec.ts`, `test/results-webhook.e2e-spec.ts`): everything except the one real
external round-trip. Rate-limit (`429` + `Retry-After`) and transient-failure scenarios can
only be tested via a mock — no real service will return a `429` on demand — so these are unit
tests against a mocked `WEBHOOK_HTTP`, using `jest.useFakeTimers()` +
`advanceTimersByTimeAsync` to assert exact backoff delays without the suite actually waiting
seconds per test (same technique `log-conversion.service.spec.ts` already established for its
own bounded-retry loop). The e2e suite hits a throwaway local `http.createServer`
(`test/support/webhook-stub.ts`), not webhook.site — a real network round-trip with real
headers and real body bytes, just not the real external service, since that one isn't
scriptable enough to assert against deterministically in CI.

**Live/manual verification, done for real once**: pointed `.env`'s `RESULTS_WEBHOOK_URL` at a
freshly generated webhook.site URL, booted `pnpm dev:api`, pushed results twice via `curl`.
Confirmed via webhook.site's own API that exactly one request landed, with the correct body
and all four headers (including a signature independently recomputed and verified against the
shared secret), and that the second push produced no second request.
