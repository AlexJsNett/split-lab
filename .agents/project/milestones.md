# Milestones

Work through these roughly in order. Each one should end in something runnable. Milestones
from M9 onward map directly to specific lines in `target-stack.md` — that's deliberate.

`CLAUDE.md` tracks only the current milestone; this file is the full list — open it when
planning the next one or checking what's still ahead.

- [x] **M1 — NestJS skeleton**: `nest new`, `GET /health` returns 200, TypeScript configured,
      dev script with hot reload. Wire `dev:api` at the root to run it.
- [x] **M2 — Data layer**: Docker Compose with a Postgres container, Drizzle connected,
      schemas for `Project` and `FeatureFlag`, migrations (not `drizzle-kit push`).
- [x] **M3 — Projects & Flags CRUD**: NestJS controllers/services/DTOs, `class-validator`
      input validation, meaningful error responses (RESTful conventions — status codes,
      resource-oriented routes).
- [x] **M4 — Experiments & assignment**: experiments + variants CRUD, the deterministic
      assignment endpoint (`GET /experiments/:id/assign?userId=`), log an exposure event
      on assignment. Apply SOLID where it's actually warranted (e.g. an `AssignmentService`
      that's easy to unit test in isolation) — don't force patterns where they don't fit.
      Done: `AssignVariantService` + pure `assignVariant()` domain function (hash key →
      bucket → cumulative-weight walk), full unit coverage (37 tests total across the API).
- [x] **Stretch — Prisma exposure** — resolved differently than originally planned, but
      done. The bounded ports-and-adapters version below was superseded mid-M4 by a full
      Drizzle→Prisma rewrite (developer's explicit call, overriding the "one entity is
      enough" reasoning) — real, tested, working Prisma code exists in git history at
      commit `1450a07`. After hands-on time with it, developer found Prisma's generated-client
      layer added real friction (`.js`-extension resolution, webpack/jest config workarounds)
      compared to Drizzle's directness, and asked to revert — done at commit `0495928`, back
      on Drizzle, which is what's running now. Net result: genuine Prisma exposure happened
      (satisfies the `target-stack.md` line), informed opinion formed on the tradeoff, and
      Drizzle stays primary. ~~Pick ONE entity (`Project`), define a `ProjectRepositoryPort`
      interface in `domain/`, implement it twice...~~ — no longer needed, superseded by the
      above.
- [x] **M5 — Conversion tracking & results**: `POST /events` for conversions, an aggregation
      endpoint that returns per-variant exposure count, conversion count, conversion rate.
      Done: `log-conversion` (`POST /projects/:projectId/experiments/:id/conversions`, reuses
      the variantId from the user's prior exposure event) and `get-results`
      (`GET /projects/:projectId/experiments/:id/results`, `count()`+`groupBy()` aggregation,
      zero-fills variants with no events), full unit coverage.
- [x] **M6 — Frontend wired to the real API**: replace the Next.js boilerplate with a
      dashboard that lists projects/flags/experiments and shows results. Frontend stays
      dumb — no logic beyond what the dashboard actually needs.
      Done: read-only dashboard (`/`, `/projects/[id]`, `/projects/[id]/experiments/[id]`),
      shadcn table/badge/card, `app/_shared/{ui,lib}` FSD layer, server-component `fetch`,
      no auth/forms yet (M7 added auth after).
- [x] **M7 — Auth**: API key guard in Nest (the `Project.apiKey` field already fits this),
      reject unauthenticated requests.
      Done: `ApiKeyGuard` (global via `APP_GUARD`, `x-api-key` header, sha256 hash lookup,
      `@Public()` bypass) + `ProjectOwnershipGuard` (IDOR protection, `@ProjectIdParam()`
      metadata, `@AuthProject()` param decorator), `GET /projects` scoped to caller's own
      project, full unit coverage on both guards (62/62 tests total).
- [x] **M8 — Tests**: Jest unit tests, starting with the assignment/bucketing logic since
      it's the trickiest bit to get right. Add a couple of e2e tests with Nest's test utils.
      (Note: as of the 100% coverage policy, tests land alongside every milestone, not
      deferred to here — this milestone is really "close any remaining gaps.")
      Done: unit coverage was already complete from prior milestones (62/62). This milestone
      closed the actual gap — real e2e coverage. The M1-era stale `/health` e2e spec (route
      deleted in M7) got replaced with 4 real spec files hitting the actual `AppModule` +
      `splitlab_test` Postgres through `supertest`: `projects`, `flags`, `auth` (guards
      through real HTTP, not mocked `ExecutionContext`), `experiment-lifecycle` (variants ->
      assign -> conversion -> results golden path). Found and fixed a real bug along the way:
      `DrizzleModule` never closed its `pg.Pool` on shutdown — harmless for a long-running
      server, but left e2e test files hanging on an open handle. `test:e2e` now runs
      `--runInBand`, since all 4 files share one real database and Jest's default parallel
      workers raced each other's `TRUNCATE`s otherwise. 13/13 e2e passing, 75 tests total
      across the API.
- [x] **M9 — Redis + async events**: move event ingestion off the request/response path —
      publish exposure/conversion events to a Redis-backed BullMQ queue, process them in a
      worker. This is the "asynchronous processing" line from the target list.
      Done: `src/queue/queue.module.ts` (`@Global()`, `BullModule.forRootAsync`, mirrors
      `DrizzleModule`'s connection-config shape) plus `features/process-events/` (the
      `@Processor('events')`/`WorkerHost` worker that does the actual `db.insert(events)` —
      now the only file in `src` that does). `assign-variant` and `log-conversion` each
      `registerQueue({ name: 'events' })` and push `'exposure'`/`'conversion'` jobs instead of
      inserting inline. Redis added to `docker-compose.yml` (no persistence volume — an
      ephemeral event queue doesn't need durability, Postgres is the durable store once the
      worker writes). Real gotcha: `bullmq`'s `ioredis` dependency is declared as a
      `peerDependency`, not auto-installed — had to `pnpm add ioredis` explicitly or
      `@nestjs/bullmq` fails to resolve at require time. Also had to resolve
      `pnpm-workspace.yaml`'s `allowBuilds` gate for `msgpackr-extract` (bullmq's optional
      native msgpack accelerator, has a pure-JS fallback) — set `false`, same call as
      `@nestjs/core`. The known trade-off: `logConversion`'s exposure lookup can no longer
      assume read-your-own-writes (the exposure may still be queued, not yet in Postgres) —
      solved with a bounded retry (25ms/50ms/100ms, 4 attempts) rather than making exposure
      synchronous again. e2e: `test/support/test-app.ts` gained `waitForQueueDrain()`, polling
      `Queue.getJobCounts()` before any assertion that reads `/results` straight from Postgres.
      66/66 unit tests, 13/13 e2e passing. Full writeup: `.agents/guides/backend/messaging.md`.
      Follow-up hardening (same milestone, separate pass): the "ephemeral queue, Postgres is
      the durable store" call above didn't account for two independent loss windows — a
      transient Postgres blip during `process(job)` with `attempts: 1` (no retry) just drops
      the job, and Redis itself restarting with no persistence loses every queued job, not
      just ones mid-flight. Closed with three independent layers: (1) `EVENT_JOB_OPTIONS`
      (`{ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }`, one shared constant
      in `process-events.processor.ts`, imported by both producers) so a short Postgres blip
      self-heals via BullMQ's own retry loop; (2) `docker-compose.yml`'s `redis` service gained
      `command: redis-server --appendonly yes` + a `redis-data` volume (same shape as
      `postgres-data`) so a Redis container restart replays from disk instead of losing
      in-flight jobs; (3) `ReconcileFailedEventsService` (new `@nestjs/schedule` dependency,
      `ScheduleModule.forRoot()` in `AppModule`), a `@Cron(CronExpression.EVERY_5_MINUTES)` job that calls
      `eventsQueue.getFailed()` and `job.retry()` on each one — for a Postgres outage long
      enough to exhaust Layer 1's 3 attempts. Real gotcha: `job.retry()`'s default `state`
      argument is already `'failed'`, matching `getFailed()`'s output, and a manual `.retry()`
      isn't blocked by the job already being at its `attempts` ceiling (that ceiling only gates
      BullMQ's *automatic* retries) — so no extra options were needed to make Layer 3 actually
      retry an exhausted job. 68/68 unit tests, 13/13 e2e passing. Full writeup:
      `.agents/guides/backend/messaging.md`.
      **Superseded by M10** — RabbitMQ fully replaces this BullMQ/Redis implementation, not
      layered alongside it (same "second full swap, not a bounded exercise" pattern the
      Drizzle<->Prisma detour already used). The work above is still real and still satisfies
      the "asynchronous processing"/"Redis" lines from `target-stack.md`; it lives in git
      history at `0d7c8b1`/`64c9cba` for reference, not deleted from the record.
- [x] **M10 — RabbitMQ + a second service**: split event processing into its own NestJS
      microservice, communicating with the main API over RabbitMQ instead of BullMQ. This is
      the SOA/microservices + message-broker line — inter-service comms, not just a queue.
      Done: new workspace member `packages/events-contract` (`@split-lab/events-contract`) —
      the only thing shared between the two processes, `EventMessage` + `EVENT_PATTERN`
      constants, nothing else (no DB schema, no framework code). New app
      `apps/event-processor` mirrors `apps/api`'s FSD conventions exactly (same `@/*` alias,
      same eslint/prettier/Jest setup, own `DrizzleModule` + a minimal 5-column `events`
      pgTable with no `.references()` — `apps/api` keeps sole ownership of migrations, a
      column-parity unit test is the tripwire against the two definitions drifting). The
      worker is the sole owner of the RabbitMQ topology (`src/messaging/topology.ts` +
      `assert-topology.ts`, asserted at boot before `createMicroservice`): one `events`
      exchange-free DLX-backed queue, an `events.dlx` exchange, an `events.retry` queue
      (`x-message-ttl: 5000`), and an `events.parked` queue — `x-death` header counting
      replaces BullMQ's `attemptsMade`, bounded at 3 cycles before a message parks instead of
      cycling forever. `assign-variant`/`log-conversion` swapped `@InjectQueue`/`Queue.add`
      for `ClientsModule.registerAsync`/`ClientProxy.emit`, producers set `noAssert: true` so
      the worker's topology is the only declaration that exists (a mismatch would otherwise
      crash the process with an uncaught 406, not a rejected promise).
      `logConversion`'s bounded exposure retry widened one rung (`[25,50,100,200]`, 5
      attempts) since the write now crosses a process boundary and a broker hop. RabbitMQ
      (`rabbitmq:4-management`, for the live queue-inspection UI this milestone is built
      around) added to `docker-compose.yml`; Redis fully removed (container, volume,
      `REDIS_*` env vars, `bullmq`/`ioredis`/`@nestjs/bullmq` dependencies, the
      `msgpackr-extract` `allowBuilds` entry) — not kept alongside, since two brokers doing
      the same job would be strictly worse than either alone.
      Real gotchas, found live (not just from the pre-build probe the plan was written from):
      (1) a raw `.ts` package `main` field (`packages/events-contract`) works fine for `tsc`
      but breaks at runtime the moment webpack leaves it as an external `require()` for Node's
      native TypeScript loader to resolve — fixed by giving the contract package an actual
      `tsc` build step (`dist/index.js`), and wiring `turbo.json`'s `dev`/`typecheck`/`test`
      tasks with `dependsOn: ["^build"]` so that's automatic; (2) the parking-lot handoff
      originally re-serialized just the decoded `EventMessage` payload, silently dropping
      Nest's `{pattern,data}` envelope — the reconciliation cron's republish then had no
      pattern to route on and cycled forever as an "unsupported event," never reaching the
      handler again. Only surfaced wiring the full retry -> park -> reconcile path live with
      Postgres actually stopped and restarted; fixed by parking the original raw envelope
      bytes instead. Both are documented in `messaging.md` so they don't get rediscovered.
      Step 3's live acceptance criterion was run for real: with Postgres stopped, a published
      message was watched cycling `events -> events.retry -> events` in the RabbitMQ
      management UI, landed in `events.parked` after 3 cycles, and — once Postgres was
      restarted — was drained back by the real `@Cron(EVERY_5_MINUTES)` job at the real
      wall-clock 5-minute mark and persisted. e2e split in two per D8 (`messaging.md`/
      `testing.md` have the full reasoning): `apps/api`'s suite now asserts published message
      shape (`readPublishedEvents`/`seedEvents` replace M9's `waitForQueueDrain`),
      `apps/event-processor` gained its own e2e suite (happy path, forced-failure retry ->
      park via a real FK violation rather than stopping Postgres, reconciliation drain) with a
      200ms `TEST_RETRY_TTL_MS` so it isn't gated on real 5-second sleeps. The live
      cross-service golden path (assign -> conversion -> results with both processes actually
      running) is deliberately deferred to M13 — see that entry below.
      63/63 `apps/api` unit tests + 16/16 e2e; 16/16 `apps/event-processor` unit tests + 5/5
      e2e. Full writeup: `.agents/guides/backend/messaging.md`.
- [x] **M11 — Third-party REST integration**: built a generic signed outbound webhook that
      pushes experiment results out, rather than the Slack-specific example this bullet
      originally suggested — the developer declined creating a real Slack account, and the
      retry/auth/idempotency skill being tested doesn't depend on the target being Slack
      specifically. Live/manual verification target: webhook.site (free, no signup, real
      public capture URL).
      Done: new `POST /projects/:projectId/experiments/:id/results/push` (manual trigger,
      chosen over auto-fire-on-completion — the latter would force a `forwardRef()` cycle
      between `PushResultsModule` and `ManageExperimentsModule`, a real structural smell, not
      a style call; see `third-party-integrations.md`). `ResultsWebhookClient`
      (`apps/api/src/features/push-results/results-webhook.client.ts`) signs every request
      with HMAC-SHA256 (`X-SplitLab-Signature`/`-Timestamp`/`-Idempotency-Key` headers),
      retries transient failures (network errors, `408`, `429`, `5xx`) with true exponential
      backoff (1s/2s/4s, 4 attempts total), honors `Retry-After` on `429` (capped at 30s),
      and never retries a permanent `4xx`. Idempotency key is content-derived
      (`sha256(experimentId + sorted results)`), backed by a `webhook_deliveries` table whose
      `idempotencyKey` unique constraint — not the pre-check `SELECT` — is what actually
      closes the race between two concurrent pushes; a second push of unchanged results makes
      zero network calls.
      HTTP client: switched mid-implementation from the originally-planned `@nestjs/axios`
      to Node 20's native `fetch`, wrapped behind a small `WEBHOOK_HTTP` DI token
      (`webhook.config.ts`) so specs still mock via a token like every other spec in this
      repo, instead of stubbing a global — zero new HTTP-client dependencies added.
      Live-verified for real: booted `pnpm dev:api`, pushed against an actual webhook.site
      URL, confirmed the signed request (correct signature, all four headers, correct body)
      landed via webhook.site's own API, then confirmed a second push produced zero new
      requests. 85/85 `apps/api` unit tests (22 new) + 18/18 e2e (2 new, against a local
      stub server — webhook.site itself isn't scriptable enough for automated retry/429
      scenarios, only for the one live manual round-trip).
      Full writeup: `.agents/guides/backend/third-party-integrations.md`.
- [ ] **M12 — Second datastore (pick one)**: Elasticsearch for full-text search over
      experiments/flags, or MongoDB for the raw event log (polyglot persistence — Postgres
      stays the source of truth for entities, Mongo/ES hold something Postgres is a bad fit
      for). Pick based on which one you're weaker on.
- [ ] **M13 — Docker Compose for the whole stack**: API + worker/microservice + web +
      Postgres + RabbitMQ + chosen second datastore, one `docker-compose up` (Redis was fully
      removed in M10 — RabbitMQ replaced it, not layered alongside it, so it's not part of
      this list). This is also the natural home for the live cross-service golden-path e2e
      test M10 deliberately deferred (D8): a real black-box test hitting `POST /assign` then
      `POST /conversions` then `GET /results` against the whole stack running together —
      `apps/api` and `apps/event-processor` both actually up, not each tested in isolation the
      way M10's two separate e2e suites do it. Wiring that inside a single Jest run pre-M13
      would need a fragile cross-package dev dependency; once the whole stack is one
      `docker-compose up`, it's a natural fit instead.
- [ ] **M14 — CI hardening + AWS**: test gate in CI, path-based triggers so web/api build
      independently. Then a real deploy target on AWS (EC2 for the containers, S3 for static
      assets, Lambda if a piece of this naturally fits serverless) — this is explicitly a
      "plus," treat it as the stretch milestone once M1–M13 are solid.
- [ ] **M15 — Client SDK**: a small npm package (`packages/sdk` or standalone), modeled after
      GrowthBook's JS/Node SDK — deliberately copy the shape to learn it, not to reinvent it.
      Fetches flag/experiment config from `apps/api` for a project (by `apiKey`), does the
      deterministic bucketing **locally** (no round-trip per evaluation), exposes something
      like `client.isOn('flag-key')` / `client.getExperimentVariant(id, userId)`. Config
      caching + a refresh/poll interval. This is the actual "SDK" skill GrowthBook is known
      for — the hard part is local evaluation matching server-side bucketing exactly.
- [ ] **M16 — Analytics / results dashboard**: push `apps/web` results screens closer to
      GrowthBook's actual results UI — per-variant exposures/conversions/conversion rate
      (already have the numbers from M5), plus a simple confidence indicator or interval,
      and a time-series view of exposures/conversions over the experiment's run. Copy
      GrowthBook's layout/approach as closely as practical to learn from it first; diverge
      once you have your own ideas about what's missing or worth doing differently.

- [ ] **M17 — MCP server**: expose split-lab's data (projects, flags, experiments, variants,
      results) as MCP tools/resources, so an MCP-compatible AI client (Claude Desktop, Claude
      Code, Cursor, or the in-app chat from M18) can query analytics data directly instead of
      through the REST API by hand. Start read-only (list projects, get experiment results,
      check a flag's rollout) — writes (create a flag, start an experiment) are a deliberate
      stretch, not the M17 baseline, since an AI-triggered mutation needs more thought about
      confirmation/scoping than a read does. **Not from `target-stack.md`** — unlike M9–M16,
      this doesn't map to a job-requirement line (the AI-related lines there are about *you*
      using AI assistants day-to-day, already closed; this is a product feature). This is your
      own direction: growing split-lab from "GrowthBook clone" toward "GrowthBook +
      Amplitude's built-in AI chat" — worth being explicit that the motivation is different
      from every other milestone in this list.
- [ ] **M18 — In-app AI chat**: a slide-out chat panel in `apps/web`'s admin dashboard (open
      from the side, like Amplitude's), backed by an LLM on the API side that answers
      questions about the signed-in project's data ("how's the checkout experiment doing",
      "which flags are enabled") by calling the same M17 MCP tools server-side — a tool-calling
      loop, not a raw unstructured prompt. Each user supplies their **own** LLM API key
      (OpenAI/Anthropic/etc — bring-your-own-key), so split-lab itself never pays for or rate-
      limits anyone's usage. **Security note to get right when this lands**: an LLM key is not
      the same shape as `Project.apiKeyHash` — the project's own API key only ever needs to be
      *compared* (hash it, compare hashes, never need the original back), but an LLM key has to
      be *used* — sent to OpenAI/Anthropic on the user's behalf — so it must be **encrypted at
      rest, not hashed** (reversible, e.g. AES via a server-held secret), still never returned
      in any API response after the initial save. Don't copy the `apiKeyHash` pattern here by
      reflex, the two have different requirements.

## Backlog — not tied to a specific milestone yet

- **`apps/web` e2e tests (Playwright)**: real browser hitting a real running `pnpm dev:web` →
  `pnpm dev:api` → Postgres — not unit tests, since the current pages are Server Components
  with zero branching/logic (fetch + render), where unit tests would just be testing
  React/Next.js itself. Low ROI right now with only 3 read-only pages from M6's first pass —
  revisit once there's more UI (especially once forms/mutations exist, where there's actual
  logic worth covering). This is the deploy-time check — runs once per change, against the
  test DB, same shape as `apps/api`'s own `test:e2e`.
- **Production synthetic monitoring** (belongs with M14, once a real AWS prod environment
  exists — doesn't apply yet, there's no prod, only local dev + `splitlab_test`): a scheduled
  job (every few minutes) running a full-journey script against the *real* prod system —
  signup → log out → log in → exercise a small **critical/golden-path** subset of
  functionality (not the whole app — keep this fast and cheap to run continuously, unlike the
  exhaustive e2e suite) → delete the account. Two safety requirements: (1) the synthetic
  account needs an identifiable pattern (e.g. `synthetic-monitor+<timestamp>@...`) plus a
  separate cleanup sweep job, so a mid-run crash before the delete step doesn't leave junk
  data behind; (2) this is layered on top of, not instead of, a plain `GET /health` heartbeat
  check (already exists from M1) — health check is cheap/frequent, full-journey synthetic is
  heavier/less frequent.

Not a milestone, an ongoing habit: every milestone above should go through Claude Code for
review/refactor/tests/docs at some point — that's the "daily AI-assisted workflow" line from
the target list, and it's already how this project works.
