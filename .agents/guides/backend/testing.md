# Back-end Testing (Jest)

100% coverage policy (see `AGENTS.md`) means tests land with every milestone, not deferred to
M8 — M8 is "close any remaining gaps," not "write the first test."

## Unit tests: service/logic classes, mocked repository

Convention established in `manage-projects.service.spec.ts` (M3): mock the TypeORM
`Repository`, don't hit a real database. `Test.createTestingModule` builds a real Nest DI
graph for the test, but with a fake repository swapped in:

```ts
const module = await Test.createTestingModule({
  providers: [
    ManageProjectsService,
    { provide: getRepositoryToken(ProjectEntity), useValue: repository },
  ],
}).compile();
```

`getRepositoryToken(XEntity)` is the same DI token Nest uses internally for
`@InjectRepository(XEntity)` — providing a plain object under that token makes the service
think it received the real thing. The fake repository is a plain object of `jest.fn()`s (one
per `Repository` method the service actually calls — `create`, `save`, `find`, `findOneBy`,
`preload`, `delete`), programmed per-test via `mockResolvedValue`/`mockImplementation` to
return whatever that specific test needs. Rebuilt fresh in `beforeEach` so one test can't leak
state into the next.

This tests the service's *logic* (does it hash before saving, does it throw
`NotFoundException` when the repository reports nothing found, does the response ever leak
`apiKeyHash`) without depending on Postgres being up or caring what real SQL TypeORM would
generate.

## e2e tests: real app, real (but separate) database

`test/*.e2e-spec.ts`, run via `pnpm run test:e2e` — boots the actual `AppModule` (real
`TypeOrmModule.forRootAsync`, real Postgres in Docker) and hits routes through `supertest`.
Used sparingly (per `AGENTS.md`'s testing policy, these complement rather than replace unit
tests) — currently just the M1 health check. Expand as controllers land, one happy-path e2e
per resource is enough; edge cases and branching belong in the unit tests above.

**Not the same database as manual dev testing.** e2e tests hit a real Postgres, but a
dedicated one (`splitlab_test`), never the `splitlab` database you `curl` against by hand —
otherwise e2e runs would insert/delete real rows next to your own manual test data. This is
wired through `NODE_ENV`:

- `apps/api/.env.test` — same host/port/creds as `.env`, `DB_NAME=splitlab_test` instead of
  `splitlab`. Gitignored (like `.env`), never committed.
- `AppModule`'s `ConfigModule.forRoot` picks `.env.test` over `.env` when `NODE_ENV=test`.
- `src/data-source.ts` (the standalone CLI DataSource) does the same, via `dotenv`'s `config({
  path: ... })` instead of the bare `import 'dotenv/config'`.
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

## Commands

- `pnpm test` — all unit tests (`*.spec.ts`)
- `pnpm test -- manage-projects.service` — a single file (Jest's own filename filter)
- `pnpm run test:e2e` — e2e suite, against `splitlab_test`
- `pnpm run migration:run:test` — apply pending migrations to `splitlab_test` specifically
