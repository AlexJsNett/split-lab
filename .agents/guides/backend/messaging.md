# Async Processing & Messaging (RabbitMQ + a second service)

M9 moved event ingestion off the request/response path onto a Redis-backed BullMQ queue,
processed in-process by a worker living inside `apps/api`. M10 replaces that entirely: a
second NestJS microservice (`apps/event-processor`) now consumes `exposure`/`conversion`
events over RabbitMQ. This is the SOA/microservices + message-broker line from
`target-stack.md` — inter-service comms, not just a queue. BullMQ/Redis are gone; the M9
section below is kept as history (the eventual-consistency reasoning it introduced still
applies verbatim under M10).

## Which events go through the broker, and why

Unchanged from M9: both `exposure` (from `assign()`) and `conversion` (from
`logConversion()`) publish to RabbitMQ instead of doing a synchronous `db.insert(events)` in
the request handler. `assign()` is the hot path — called on every feature-flag/experiment
check — so it can't wait on Postgres; `conversion` goes through the same path for the same
"one code path to reason about" consistency reasoning M9 established.

## Two processes, one message contract

- **`apps/api`** — the producer. `assign-variant.service.ts` and `log-conversion.service.ts`
  each inject a `ClientProxy` (token `'EVENTS_CLIENT'`) and call
  `client.emit(EVENT_PATTERN.EXPOSURE | CONVERSION, message)`.
- **`apps/event-processor`** — the consumer, a *separate* NestJS process (`createMicroservice`,
  not `NestFactory.create` — no HTTP server at all). `features/process-events/
  process-events.controller.ts` declares `@EventPattern(EVENT_PATTERN.EXPOSURE)` /
  `@EventPattern(EVENT_PATTERN.CONVERSION)` handlers that do the actual
  `db.insert(events).values(message)` — the only place in either app that still writes to the
  `events` table directly.
- **`packages/events-contract`** (`@split-lab/events-contract`) — the one thing that must not
  drift between the two processes: `EventMessage` (`experimentId`/`variantId`/`userId`/`type`)
  and the `EVENT_PATTERN` constants. Nothing else is shared — see "What is NOT shared" below.

One queue (`events` in dev, `events_test` in the test env — see Env & config), two patterns,
same reasoning M9 had for two BullMQ job names on one queue: the pattern name doubles as the
message's identity in the RabbitMQ management UI, and one queue is simpler to reason about
than two.

## What is NOT shared: the DB schema

Both processes talk to Postgres, but each owns its own connection and its own `events`
pgTable definition — `apps/event-processor/src/entities/event/infrastructure/event.schema.ts`
is a 5-column, no-`.references()` mirror of `apps/api`'s authoritative schema.
`apps/api` keeps sole ownership of migrations; the worker's copy is covered by a
column-parity unit test (`event.schema.spec.ts`) so the two definitions drifting is a loud
test failure, not a silent runtime bug. Rejected alternative: `apps/event-processor` depending
on `@split-lab/api` as a workspace package — `apps/api` bundles through webpack with no
`exports` map, so importing its internals from a sibling package would be fragile in exactly
the way the M4-era Prisma detour already taught this project to avoid.

## Topology: one main queue, a DLX, a retry queue, a parking queue

`apps/event-processor` is the **sole owner of the RabbitMQ topology** — it asserts everything
below explicitly at boot (`src/messaging/assert-topology.ts`, called from `main.ts` *before*
`createMicroservice`), using a raw `amqplib` connection. Nest's own `ServerRMQ` only ever
asserts the one queue it listens on; it never declares the DLX, retry, or parked queues the
retry mechanism depends on.

```
                 publish (exposure/conversion)
apps/api  ─────────────────────────────────────▶  events  ──▶ @EventPattern handler
                                                     ▲              │
                                                     │  after TTL   │ throw (nack, requeue=false)
                                                     │              ▼
                                            events.retry  ◀──  events.dlx
                                            (x-message-ttl=5s)

  x-death.count >= 3 on the next delivery:
    events (handler) ──sendToQueue──▶ events.parked   (message is not lost)

  ReconcileParkedEventsService (@Cron, every 5 min):
    events.parked ──sendToQueue──▶ events   (drains the parking lot back in)
```

Exact assertion sequence (`buildTopology(queue)` in `src/messaging/topology.ts`, names derived
from the configured `RABBITMQ_QUEUE` so dev/`events` and test/`events_test` never collide):

```
exchange events.dlx        (direct, durable)
queue    events            (durable, x-dead-letter-exchange = events.dlx)
queue    events.retry      (durable, x-message-ttl = 5000,
                            x-dead-letter-exchange = '', x-dead-letter-routing-key = events)
bind     events.retry -> events.dlx, routing key 'events'
queue    events.parked     (durable)
```

The producer publishes with `sendToQueue` under the hood, so a message's routing key is the
queue name itself (`events`), and dead-lettering preserves that routing key — which is why
`events.retry` is bound to the DLX with routing key `events`: that's what makes the retry loop
close back onto the main queue after the TTL expires.

## Manual ack is mandatory, not optional

Two Nest defaults work against you here, both verified against a real RabbitMQ 4 container
before this was built:

- **`RQM_DEFAULT_NOACK = true`** — Nest's RMQ transport auto-acks by default: the broker drops
  the message the instant it's written to the socket, before the handler even runs. If the DB
  insert then fails, the event is just gone. `main.ts` sets `noAck: false` explicitly.
- With `noAck: false`, **Nest never acks an `@EventPattern` handler for you** — `server-rmq.js`
  itself contains zero `channel.ack(...)` calls. The handler has to do it manually via
  `ctx.getChannelRef()` / `ctx.getMessage()`.

A handler that throws without being caught is swallowed by Nest's `RpcExceptionsHandler` —
logged, but with **no ack and no nack**. The message just sits unacked forever, silently
wedging one of the consumer's `prefetchCount` slots; only a consumer disconnect eventually
requeues it. This is why `process-events.controller.ts`'s `persist()` wraps the insert in an
explicit `try/catch`: **every exit path ends in exactly one `ack` or `nack`**, no path relies on
Nest's own exception handling to do the right thing.

## The retry-counting trick: `x-death`

RabbitMQ has no first-class "attempts made" counter on a message the way BullMQ's `Job` does.
Instead, every time a message is dead-lettered, RabbitMQ appends/increments an entry in the
message's `x-death` header, keyed by `{queue, reason}`. `src/messaging/rmq-retry.ts`'s
`retryCount(message, queue)` reads the `{queue: 'events', reason: 'rejected'}` entry's `count`
(0 if that entry doesn't exist yet — the first delivery). Verified incrementing `0 -> 1 -> 2`
across three real retry cycles.

`persist()`'s decision: if `retryCount(raw, queue) >= MAX_RETRIES` (3), hand the message to
`events.parked` and **ack** the original delivery (stop cycling it); otherwise **nack**
`(raw, false, false)` — `requeue=false` is what triggers RabbitMQ to dead-letter it via the
queue's own `x-dead-letter-exchange`, not a requeue onto the same queue.

**Gotcha worth remembering, found live wiring the full retry -> park -> reconcile path**: the
parking handoff must republish the message's original bytes (`raw.content` — the full
`{"pattern":...,"data":{...}}` envelope Nest deserialized from), not a fresh
`JSON.stringify(message)` of just the decoded payload. Re-serializing only the payload silently
drops the `pattern` field; when `ReconcileParkedEventsService` later republishes it, Nest has
no pattern to route on and rejects it as an unsupported event — which then cycles it right back
through the DLX forever, never reaching the handler again. This only surfaces once the full
round trip runs end to end, not from testing park-on-its-own.

## The three M9 reliability layers, rebuilt on RabbitMQ's own primitives

There's no 1:1 BullMQ -> RabbitMQ feature mapping; each layer is a genuinely different
mechanism, not a renamed one:

| M9 layer (BullMQ) | M10 (RabbitMQ) | Honest delta |
|---|---|---|
| **L1** `attempts: 3` + exponential backoff (~1s/2s/4s, ~7s cover) | DLX `events.dlx` -> `events.retry` (`x-message-ttl: 5000`) -> back to `events` after 5s, bounded at 3 cycles via `x-death` | **Fixed 5s backoff, not exponential.** True exponential needs one retry queue per delay tier. Deliberately not done — one tier is simpler to explain and draw, and 3 x 5s = 15s of cover beats M9's ~7s even though the curve is flatter. |
| **L2** Redis AOF (`appendonly yes`) + volume | `durable: true` on every queue + `persistent: true` on every publish + `rabbitmq-data:/var/lib/rabbitmq` volume. Both Nest defaults are OFF, so all three have to be set explicitly. | **Stronger than M9.** RabbitMQ fsyncs a persistent message before returning a publish-confirm, and `firstValueFrom(client.emit(...))` awaits that confirm — a confirmed publish is already on disk, not a ~1s `appendfsync everysec` window. |
| **L3** `ReconcileFailedEventsService` cron -> `queue.getFailed()` -> `job.retry()` | `ReconcileParkedEventsService` cron -> drain `events.parked` -> `sendToQueue(events, ...)` | Same shape, same 5-minute interval, same reasoning (give Postgres real recovery time before retrying, not to save resources). |
| *(new, no M9 equivalent)* | Explicit `try/catch` + `channel.nack(msg, false, false)` in the handler | Mandatory — BullMQ's worker loop caught throws for us; RabbitMQ's transport does not. |

## Publish-confirm durability (`firstValueFrom`)

`amqp-connection-manager` (the connection layer `@nestjs/microservices`' RMQ transport uses
under the hood) publishes over a `ConfirmChannel`. `await firstValueFrom(client.emit(pattern,
message))` resolves (to `undefined`, not `EmptyError`) only once the broker has confirmed the
publish — a real durability guarantee BullMQ's `.add()` never gave: with M9, `.add()` resolved
as soon as the job was enqueued client-side, not once Redis had actually durably stored it.

## The 406 `PRECONDITION_FAILED` gotcha

If two sides declare the same queue with **different** arguments, RabbitMQ doesn't reject the
mismatched `assertQueue` call gracefully — it closes the channel with a 406, and on the Node
side that surfaces as an **uncaught `error` event on the `ChannelWrapper`**, not a rejected
promise. It crashes the process outright.

The fix baked into this design: `apps/event-processor` is the *only* topology owner.
`apps/api`'s producers set `noAssert: true` in their `ClientsModule.registerAsync` options —
they never call `assertQueue` themselves, so there's no second declaration to drift out of sync
with the worker's. **First thing to check if this 406 fires anyway**: the queue already exists
with different arguments (e.g. from an interrupted earlier run) — delete it in the RabbitMQ
management UI (`localhost:15672`) and restart the worker so it re-asserts cleanly. This bit the
M10 test suite once internally too: two separate e2e spec files in `apps/event-processor/test/`
each starting their own worker instance against the *same* durable `events_test.retry` queue
with two *different* `x-message-ttl` overrides — same failure class, one test suite against
itself. Fixed by giving every e2e file the same shared `TEST_RETRY_TTL_MS` constant
(`test/support/test-worker.ts`) instead of each file picking its own value.

## Dependency gotchas (verified before this was built)

- `amqplib` and `amqp-connection-manager` are **peer** dependencies of `@nestjs/microservices`,
  not real ones — the exact M9 `bullmq` -> `ioredis` gotcha again. `pnpm add` them explicitly
  in every package that uses `@nestjs/microservices`, or the transport fails to resolve at
  require time.
- `amqplib@2.x` ships its own bundled types. **Do not install `@types/amqplib`** — it's stuck
  at `0.10.8` and would shadow/conflict with the bundled 2.x types.
- Watch for a pnpm `allowBuilds` warning on install — neither package declares an install
  script, so none is expected, but M9 was surprised here twice (`ioredis`, `msgpackr-extract`).

## How e2e tests handle the async gap (D8's two-suite split)

M9's single `experiment-lifecycle.e2e-spec.ts` (assign -> conversion -> results, `Redis` +
in-process worker) can't carry over unchanged: the worker is now a *second process*, and
booting it inside `apps/api`'s Jest run would mean a cross-package dev dependency and
`moduleNameMapper` reaching into a sibling app's `src/` — fragile, and it inverts the intended
dependency direction. M10 draws the boundary explicitly instead: **the API's job is to publish
a correct message; the worker's job is to persist one.** Each suite tests its own half against
a real broker, and neither needs the other's process running.

- **`apps/api/test/`** — `waitForQueueDrain()` is gone (there's no `Queue` object to poll
  anymore). `test/support/test-app.ts` now exports `readPublishedEvents(app, count)` (drains
  `events_test` with a raw `amqplib` client, decodes Nest's `{pattern,data}` envelope, returns
  the `data` payloads) and `seedEvents(app, rows)` (inserts rows straight through `DRIZZLE` —
  standing in for what the worker would otherwise have written, since no worker runs in this
  suite). `experiment-lifecycle.e2e-spec.ts` asserts `assign`/`conversions` publish
  well-formed messages, and seeds rows directly for the `/results` aggregation test (a pure
  read endpoint, so seeding is a faithful test of it).
- **`apps/event-processor/test/`** — boots the real worker microservice (`test/support/
  test-worker.ts`'s `startTestWorker()`, the same `assertTopology` -> `createMicroservice`
  sequence as `main.ts`) against real RabbitMQ + real `splitlab_test`, publishes with a real
  `ClientProxy`. Covers happy-path persist+ack, a forced-failure retry cycle landing in
  `events.parked`, and `ReconcileParkedEventsService` draining it back. The forced failure uses
  a well-formed-but-nonexistent `experimentId`/`variantId` (a real FK violation) rather than
  stopping the shared Postgres container — deterministic, and doesn't interfere with `apps/api`'s
  own e2e suite running against the same database. Retry-timing tests override
  `x-message-ttl` to 200ms (`TEST_RETRY_TTL_MS`) so the suite isn't gated on real 5-second
  sleeps.

**Deliberately not covered**: the live cross-service golden path (assign -> conversion ->
results with *both* processes actually running). Wiring one Jest process to boot both
packages' sources needs exactly the fragile cross-package setup described above. M13 already
exists to put the whole stack (API + worker + web + all infra) behind one `docker-compose up`,
which is the natural home for a true black-box end-to-end test — see that milestone's entry in
`milestones.md`. This is a real, temporary reduction in end-to-end coverage, not something
papered over.

---

## M9 history (superseded, kept for the reasoning that still applies)

M9 landed Redis + BullMQ for the same job M10 now does over RabbitMQ. The module layout
(`src/queue/queue.module.ts`, `features/process-events/`), the three-layer reliability
follow-up, and the eventual-consistency retry in `logConversion` are all gone from the
codebase (replaced above), but the *reasoning* behind the eventual-consistency gap is
unchanged in kind under M10 — only slightly wider in practice, since the write now crosses a
process boundary and a broker hop, not just a Redis round-trip:

`LogConversionService.findExposureWithRetry` (private, `log-conversion.service.ts`) attempts an
immediate `SELECT`, then retries after 25ms/50ms/100ms/200ms (5 attempts total, ~375ms worst
case — one rung wider than M9's `[25, 50, 100]`) before giving up and throwing the existing
`BadRequestException`. This is treated the same way real event pipelines (Amplitude/Segment/
PostHog) treat it — eventual consistency, not a bug — solved with a bounded retry rather than
making `assign()`'s exposure write synchronous again (which would defeat the entire point,
since `assign()` is the actual hot path).

The M9 BullMQ implementation itself is real, tested, working code that lived in this repo and
satisfied the "Redis" line in `target-stack.md` — it's preserved in git history at `0d7c8b1` /
`64c9cba` for reference, not deleted from the record, just superseded by M10's design above.
