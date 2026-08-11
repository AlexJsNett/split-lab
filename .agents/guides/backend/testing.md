# Back-end Testing (Jest)

100% coverage policy (see `AGENTS.md`) means tests land with every milestone, not deferred to
M8 — M8 is "close any remaining gaps," not "write the first test."

## Unit tests: service/logic classes, mocked Drizzle client

Convention established in `manage-projects.service.spec.ts` (rewritten for Drizzle): mock the
whole `DRIZZLE`-provided DB client, don't hit a real database. `Test.createTestingModule`
builds a real Nest DI graph for the test, but with a fake client swapped in under the same
token the service actually injects:

```ts
const module = await Test.createTestingModule({
  providers: [
    ManageProjectsService,
    { provide: DRIZZLE, useValue: db },
  ],
}).compile();
```

`db` is a plain object with `select`/`insert`/`update`/`delete` as `jest.fn()`s — but each of
those isn't a single flat call the way `repository.findOneBy(...)` was. Drizzle's query
builder is a *chain* (`db.select().from(table).where(cond)`), so the mock has to fake the
whole chain shape, not just one function call. Per-test helpers build that chain fresh:

```ts
function mockSelectWhere(db: MockDb, resolvedRows: unknown[]) {
  db.select.mockReturnValueOnce({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(resolvedRows),
    }),
  });
}
```

`.from()` returns an object whose `.where()` is the one that actually resolves — everything
before the terminal link just has to return the next link in the chain
(`mockReturnValue({...})`), only the terminal link resolves real data
(`mockResolvedValue(resolvedRows)`). `insert`/`update`/`delete` follow the same idea with their
own terminal link (usually `.returning()`). `mockReturnValueOnce` (not the plain `mockReturnValue`)
matters when a single test triggers two sequential calls to the same method with different
needed results — e.g. `assertProjectExists`'s existence check, then the real query — each
configured independently, consumed in call order.

This is bulkier boilerplate than the old `Repository` mocks — an accepted trade-off from
moving off TypeORM's object-shaped repository onto Drizzle's chained query builder, not a
regression in test quality. It still tests the exact same thing: the service's *logic* (does
it hash before saving, does it throw `NotFoundException` when nothing came back, does the
response ever leak `apiKeyHash`) without depending on Postgres being up or caring what real SQL
Drizzle would generate.

## e2e tests: real app, real (but separate) database

`test/*.e2e-spec.ts`, run via `pnpm run test:e2e` — boots the actual `AppModule` (real
`DrizzleModule`, real Postgres in Docker) and hits routes through `supertest`.
Used sparingly (per `AGENTS.md`'s testing policy, these complement rather than replace unit
tests) — one happy-path e2e per resource is enough; edge cases and branching belong in the
unit tests above. Landed in M8: `projects`, `flags`, `auth`, `experiment-lifecycle`.

### Two services, two e2e suites (M10)

Once event processing moved to a second process (`apps/event-processor`, M10), a single e2e
suite could no longer exercise the whole assign -> conversion -> results path the way M9's
could (that would need one Jest run booting both packages' sources — a cross-package dev
dependency and `moduleNameMapper` reaching into a sibling app's `src/`, both fragile). The
boundary is drawn explicitly instead: **`apps/api`'s e2e suite tests "does the API publish a
correct message"; `apps/event-processor`'s own e2e suite (new, M10) tests "does the worker
persist one correctly."** Each runs against a real broker; neither needs the other's process
running. The live cross-service golden path (both processes actually running together) is
deliberately deferred to M13 — see `messaging.md` and `milestones.md`.

**`apps/api/test/support/test-app.ts`** — `waitForQueueDrain()` (M9, polled BullMQ's
`Queue.getJobCounts()`) is gone; there's no `Queue` object anymore. Replaced by:
- `readPublishedEvents(app, count)` — opens a raw `amqplib` channel against `events_test`,
  drains up to `count` messages, decodes Nest's `{"pattern":...,"data":{...}}` envelope, and
  returns the `data` payloads. Lets `assign`/`conversions` specs assert *"the right message
  was published"* instead of *"a row eventually appeared."* Also asserts the `events_test`
  queue into existence on `createTestApp()` (with the exact same arguments the worker would
  use) — this suite never boots the worker, so without that assertion a producer's very first
  publish would have nowhere to route to and would just vanish.
- `seedEvents(app, rows)` — inserts event rows straight through the `DRIZZLE` client. Used
  where a spec needs a row already durably in Postgres without a worker process to write it:
  the prior exposure `POST /conversions`'s `findExposureWithRetry` needs, and the rows
  `GET /results` aggregates (a pure read endpoint, so seeding is a faithful test of it).

**`apps/event-processor/test/`** (new, M10) — boots the real worker microservice
(`test/support/test-worker.ts`'s `startTestWorker()`, the same `assertTopology` ->
`createMicroservice` sequence `main.ts` itself runs) against real RabbitMQ + real
`splitlab_test`, and publishes with a real `ClientProxy` rather than a hand-built message —
that exercises the actual Nest wire envelope, not an approximation of it. Covers: happy-path
persist + ack; a forced-failure retry cycle that lands in `events.parked`; and
`ReconcileParkedEventsService` draining the parking lot. Runs `--runInBand`, same
shared-database reason M8 established for `apps/api`'s own suite.

Two gotchas specific to this suite:
- **The small-TTL trick.** The real retry queue's TTL is 5 seconds — fine in production, far
  too slow for a test asserting a message actually completes 3 retry cycles. `buildTopology()`
  takes an optional `retryTtlMs` override; `test/support/test-worker.ts` exports one shared
  `TEST_RETRY_TTL_MS` (currently 200ms) every e2e file in this package uses.
- **That constant has to be shared, not per-file.** `events_test.retry` is a *durable* queue —
  it outlives any one test file's worker connection. Two files in the same suite asserting it
  with two different `x-message-ttl` values 406-conflict against each other the moment the
  second file's `beforeAll` runs (the same `PRECONDITION_FAILED` class `messaging.md`
  documents between `apps/api` and the worker, just triggered between this suite's own files
  instead). Found live while building this suite — fixed by giving every file the same
  constant instead of letting each pick its own.
- **Forcing a real insert failure without touching Docker.** The retry/park test needs the
  worker's Postgres insert to fail deterministically. Rather than stopping the shared Postgres
  container (slow, flaky, and would interfere with `apps/api`'s own e2e suite if run around
  the same time), it publishes a message with a well-formed but nonexistent
  `experimentId`/`variantId` — a real foreign-key violation, which fails every single time,
  deterministically, with no infrastructure manipulation.

`test/support/test-app.ts` is the shared helper every spec file uses — `createTestApp()`
boots a real `INestApplication` with the same `ValidationPipe` options `main.ts` uses (e2e
tests never run through `main.ts`'s `bootstrap()`, so this has to be set up by hand or DTO
validation silently doesn't happen), `cleanDatabase()` truncates all 5 tables in one
statement between tests, `createTestProject()` calls the real `POST /projects` endpoint to
get a project + API key rather than inserting rows directly — that way every spec exercises
the same creation path a real client would use, not a DB shortcut.

**Two things had to be fixed to make a multi-file e2e suite actually work, not just a single
file:**
- `DrizzleModule` never closed its `pg.Pool` on shutdown — a single long-running server
  process never noticed, but each e2e file's `app.close()` left a dangling open connection,
  which is exactly what made a 1-file suite look fine and a 4-file suite hang. Fixed by
  giving `DrizzleModule` an `OnModuleDestroy` hook that calls `pool.end()`.
- All e2e files share the *same* `splitlab_test` database. Jest defaults to running test
  files in parallel workers — with a shared real database, one file's `beforeEach` `TRUNCATE`
  can wipe rows a different file's test is mid-way through using, producing flaky/wrong
  status codes that have nothing to do with the code under test. `test:e2e` runs
  `--runInBand` (one worker, files run sequentially) specifically because of this — it's not
  a performance knob, it's the thing that makes the DB-sharing model correct at all.

**Not the same database as manual dev testing.** e2e tests hit a real Postgres, but a
dedicated one (`splitlab_test`), never the `splitlab` database you `curl` against by hand —
otherwise e2e runs would insert/delete real rows next to your own manual test data. This is
wired through `NODE_ENV`:

- `apps/api/.env.test` — same host/port/creds as `.env`, `DB_NAME=splitlab_test` instead of
  `splitlab`. Gitignored (like `.env`), never committed.
- `AppModule`'s `ConfigModule.forRoot` picks `.env.test` over `.env` when `NODE_ENV=test`.
- `drizzle.config.ts` and `src/db/migrate.ts` (the standalone CLI-facing files) do the same,
  via `dotenv`'s `config({ path: ... })`.
- `pnpm run test:e2e` sets `NODE_ENV=test` before invoking Jest — this is the one thing that
  actually switches which database gets used; nothing else changes.

`docker/init-test-db.sql` (mounted into the Postgres container at
`/docker-entrypoint-initdb.d/`) creates `splitlab_test` automatically the first time the
container starts against a *fresh* volume — this only runs once per volume, so if
`postgres-data` already exists (as it did when this was set up), create the database by hand
once: `docker exec split-lab-postgres-1 psql -U splitlab -d splitlab -c "CREATE DATABASE
splitlab_test;"`.

**Gotcha to remember every time a new migration lands:** migrations must be run against
*both* databases — `pnpm run migration:run` (dev) and `pnpm run migration:run:test` (test) —
they're separate schemas that don't sync themselves. Forgetting the second one means e2e
tests fail against a stale schema even though dev works fine.

**Since M10, `apps/event-processor`'s own e2e suite needs the same `splitlab_test` schema
too** — it doesn't own migrations (`apps/api` keeps sole ownership, D3 in the M10 plan), but
its worker still does a real `INSERT` into the physical `events` table, FK constraints and
all. There's nothing extra to *run* here (both suites share the one `splitlab_test`
database), just something extra to *remember*: a migration that changes `events`' shape needs
`apps/event-processor/src/entities/event/infrastructure/event.schema.ts` updated by hand to
match, or its column-parity unit test (`event.schema.spec.ts`) catches the drift.

## Commands

Run from the relevant package (`apps/api` or, since M10, `apps/event-processor` too):

- `pnpm test` — all unit tests (`*.spec.ts`)
- `pnpm test -- manage-projects.service` — a single file (Jest's own filename filter)
- `pnpm run test:e2e` — e2e suite, against `splitlab_test`
- `pnpm run migration:run:test` — apply pending migrations to `splitlab_test` specifically
  (`apps/api` only — `apps/event-processor` doesn't own migrations)

Or from the root, across every package that has the script: `pnpm -w test`,
`pnpm --filter @split-lab/api test:e2e`, `pnpm --filter @split-lab/event-processor test:e2e`.
