# Async Processing & Messaging (BullMQ / RabbitMQ)

M9 landed: Redis + BullMQ move event ingestion off the request/response path. M10 (below)
still lands RabbitMQ + a second NestJS service — not written yet.

## Which events go through the queue, and why

Both `exposure` (from `assign()`) and `conversion` (from `logConversion()`) events go through
the queue — neither does a synchronous `db.insert(events)` in the request handler anymore.

The reasoning is strongest for `assign()`: it's the hot path, called on every feature-flag/
experiment check, potentially every page load a client makes. Before M9, a slow or degraded
Postgres directly added latency (or outright failures) to a request whose actual job — telling
the client which variant it got — never depended on that write succeeding first. Pushing the
write onto a Redis-backed queue lets `assign()` return right after an in-memory queue push
(~1ms) instead of waiting on a round-trip INSERT.

`conversion` writes went through the same queue for consistency, even though `logConversion()`
isn't as hot a path as `assign()` — same queue, same worker, one code path to reason about,
rather than exposure being async and conversion staying synchronous for no principled reason.

## Module layout

- `src/queue/queue.module.ts` — the connection-level module, `@Global()`, mirrors
  `src/db/drizzle.module.ts`'s shape: `BullModule.forRootAsync` reads `REDIS_HOST`/`REDIS_PORT`
  via `ConfigService`, the same way `DrizzleModule` reads `DB_HOST`/etc. It does **not**
  register the `events` queue itself — only the shared Redis connection config.
- `features/process-events/` — the consumer/worker feature. `process-events.module.ts` calls
  `BullModule.registerQueue({ name: 'events' })` and declares `ProcessEventsProcessor` as a
  provider; `process-events.processor.ts` is a `@Processor('events')` class extending
  `WorkerHost` from `@nestjs/bullmq` (v11's API — `process(job: Job)` is the method BullMQ
  calls per job, not a decorator per job type). It does the actual
  `db.insert(events).values(job.data)` — the only place in `apps/api/src` that still writes to
  the `events` table directly.
- **Producers** (`features/assign-variant`, `features/log-conversion`) each call
  `BullModule.registerQueue({ name: 'events' })` in their own module too, and inject the queue
  with `@InjectQueue('events') private readonly eventsQueue: Queue`. `@nestjs/bullmq` lets
  multiple modules register the same queue name and share the one underlying Redis-backed
  queue — each module doesn't get its own separate queue, `registerQueue` just wires up the DI
  token for that module's own injector scope.
- Job names: two distinct names on the same `events` queue — `eventsQueue.add('exposure', {...})`
  and `eventsQueue.add('conversion', {...})` — rather than one generic name with a `type` field
  doing double duty. The processor's `process(job)` reads `job.data.type` to decide which value
  to write; the job name itself is mostly for observability (Bull Board / logs read more
  clearly as "exposure" / "conversion" than a generic "event").

## The eventual-consistency trade-off

Moving exposure writes off the request path means `logConversion()`'s "does this user have a
prior exposure?" check can no longer assume read-your-own-writes: the exposure might still be
sitting in the queue, not yet in Postgres, when a conversion request arrives right behind it.

This is treated the same way real event pipelines (Amplitude/Segment/PostHog) treat it —
eventual consistency, not a bug — and solved with a **bounded retry**, not by making exposure
synchronous again (that would defeat the entire point, since exposure is the actual hot path).
`LogConversionService.findExposureWithRetry` (private, `log-conversion.service.ts`) attempts an
immediate `SELECT`, then retries after 25ms, 50ms, 100ms (4 attempts total, ~175ms worst case)
before giving up and throwing the existing `BadRequestException`. Real `setTimeout`-based
delays, not busy-waiting.

## How e2e tests handle the async gap

`apps/api/test/experiment-lifecycle.e2e-spec.ts` exercises assign → conversion → results
against a real Postgres + Redis. The conversion step doesn't need any extra waiting — the
retry above already bridges the assign→conversion race on its own. But `GET .../results` reads
straight from Postgres, so it needs the worker to have actually persisted every queued
exposure/conversion first, or the counts race the write.

`apps/api/test/support/test-app.ts` exports `waitForQueueDrain(app)`: it looks up the shared
`events` Queue instance via `app.get(getQueueToken('events'))` and polls
`queue.getJobCounts('waiting', 'active', 'delayed')` every 25ms until all three are zero (or a
5s timeout), instead of a fixed sleep — fast in the common case, with a ceiling if something's
actually stuck. Called once, right before the `/results` assertion, after every assign/
conversion call in that test has already happened.

## Once M10 lands

- How the two services communicate over RabbitMQ (exchange/queue naming, message contract,
  what happens on a failed delivery).
