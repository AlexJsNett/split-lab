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

## Reliability follow-up: three layers against event loss

The design above has two independent ways to silently lose an event: (1) Postgres is briefly
unavailable when `ProcessEventsProcessor.process(job)` runs — the insert throws, and with
BullMQ's default `attempts: 1` the job is marked `failed` and nothing retries it; (2) the Redis
container itself restarts while jobs are still sitting in its queue — with no persistence, a
restart loses every in-flight job, not just ones mid-processing. Three layers close both gaps,
each protecting against a different failure window:

**Layer 1 — `attempts` + `backoff` on both producers.** `EVENT_JOB_OPTIONS` (exported from
`process-events.processor.ts`, imported by both `assign-variant.service.ts` and
`log-conversion.service.ts` — one shared constant, not duplicated) sets
`{ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }`. A transient Postgres blip
(a few seconds) now gets retried automatically at ~1s, ~2s, ~4s after the first attempt,
entirely within BullMQ's own worker loop — no extra code needed for this case.

**Layer 2 — Redis AOF persistence.** `docker-compose.yml`'s `redis` service now runs
`command: redis-server --appendonly yes` with a named volume (`redis-data:/data`, same
pattern as `postgres`'s `postgres-data`). This protects against Redis itself restarting or
crashing while jobs are queued/active/failed — AOF replays every command from disk on
startup, so a container restart doesn't drop in-flight work. Default `appendfsync everysec`
(not `always`) — same ~1s worst-case loss window on a true crash that Postgres itself accepts
by default, not zero-loss-at-any-fsync-cost.

**Layer 3 — reconciliation job for permanently-failed jobs.** Layer 1's 3 attempts (~7s total)
only covers a short Postgres blip. A longer outage exhausts all 3 attempts, and BullMQ doesn't
auto-discard a job at that point — it sits in Redis's `failed` set (we don't set
`removeOnFail`). `ReconcileFailedEventsService` (`features/process-events/reconcile-failed-
events.service.ts`) is a `@Cron(CronExpression.EVERY_5_MINUTES)` job (via `@nestjs/schedule`'s
`ScheduleModule.forRoot()`, imported once in `AppModule`) that runs every 5 minutes: calls
`this.eventsQueue.getFailed()` to list currently-failed jobs, then `job.retry()` on each one.
`job.retry()` is BullMQ's own re-queue method — it moves the job back to `waiting` and lets it
flow through the normal `ProcessEventsProcessor.process()` path again, rather than reimplementing
the insert here. One gotcha worth knowing: `retry()`'s default `state` argument is `'failed'`
(`job.retry(state = 'failed', opts = {})`), which already matches what `getFailed()` returns —
no extra argument needed. A manually-triggered retry also isn't blocked by the job's own
`attemptsMade` already being at the `attempts` ceiling — that ceiling only gates BullMQ's
*automatic* backoff retries, not an explicit `job.retry()` call — so a job that failed all 3
Layer-1 attempts still gets one more real try each time this cron fires, for as long as
Postgres stays down.

Why 5 minutes and not more often: the check itself is essentially free either way — it reuses
the same Redis connection every producer already keeps open for `.add()`, and `getFailed()` is
a no-op when the list is empty, so a shorter interval wouldn't cost more in any way that
matters. 5 minutes exists purely to give Postgres real recovery time before retrying, not to
save resources — a 1-minute interval would just re-fail the same jobs against a database that
hasn't had time to come back yet.

These three layers are independent and non-overlapping: Layer 1 handles "Postgres blips for a
few seconds," Layer 2 handles "Redis itself restarts," Layer 3 handles "Postgres is down long
enough to exhaust Layer 1" — losing any one of them leaves a real gap the others don't cover.

## Once M10 lands

- How the two services communicate over RabbitMQ (exchange/queue naming, message contract,
  what happens on a failed delivery).
