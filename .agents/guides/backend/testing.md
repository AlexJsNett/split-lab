# Back-end Testing (Jest)

100% coverage policy (see `AGENTS.md`) means tests land with every milestone, not deferred to
M8 — M8 is "close any remaining gaps," not "write the first test."

## Unit tests: service/logic classes, mocked Prisma client

Convention established across all 4 CRUD services' spec files (rewritten for Prisma): mock
`PrismaService` itself, don't hit a real database. `Test.createTestingModule` builds a real
Nest DI graph for the test, but with a fake client swapped in for the same class the service
actually injects — no token involved any more (see `nestjs-concepts.md`'s closed arc on this):

```ts
const module = await Test.createTestingModule({
  providers: [
    ManageProjectsService,
    { provide: PrismaService, useValue: prisma },
  ],
}).compile();
```

`prisma` is a plain object shaped like `{ project: { create: jest.fn(), findMany: jest.fn(),
... } }` — one flat `jest.fn()` per Prisma model method the service actually calls, **not** a
chain. This is a real reversal of the prior framing in this file: Drizzle's query builder
(`db.select().from(table).where(cond)`) needed each mock to fake an entire chain of
`mockReturnValueOnce({...})` calls before the terminal link resolved real data, which is why
the old Drizzle-era spec files carried a ~40-line `mockInsert`/`mockSelectWhere`/`mockUpdate`/
`mockDelete` helper set. Prisma's client has no chain — `prisma.project.findUnique(...)` is
already the terminal call — so each test just does:

```ts
prisma.project.findUnique.mockResolvedValueOnce({ id: '1', name: 'X', apiKeyHash: 'hash' });
```

That's the whole mock, no builder-chain helper needed. What was previously written off as "an
accepted trade-off" (bulkier boilerplate from moving off TypeORM's flat `Repository` mocks onto
Drizzle's chained builder) turned out to be reversible: Prisma's client is flat too, so this
swap shrinks each spec file's mock plumbing back down to a handful of lines, not a regression to
work around. It still tests the exact same thing across all 4 files: the service's *logic*
(does it hash before saving, does it throw `NotFoundException` when nothing came back, does the
response ever leak `apiKeyHash`, does `updateManyAndReturn`/`deleteMany` returning an empty
array/zero count map to a 404) without depending on Postgres being up or caring what real SQL
Prisma would generate.

Per `AGENTS.md`'s testing philosophy ("the extra e2e/mock practice on simple code is itself
part of what this project trains"), this mock setup is kept copy-pasted per spec file rather
than deduped into a shared test helper — a deliberate choice, not an oversight. At Prisma's
flat-mock size the duplication cost is genuinely small.

## e2e tests: real app, real (but separate) database

`test/*.e2e-spec.ts`, run via `pnpm run test:e2e` — boots the actual `AppModule` (real
`PrismaModule`, real Postgres in Docker) and hits routes through `supertest`.
Used sparingly (per `AGENTS.md`'s testing policy, these complement rather than replace unit
tests) — currently just the M1 health check. Expand as controllers land, one happy-path e2e
per resource is enough; edge cases and branching belong in the unit tests above.

**Not the same database as manual dev testing.** e2e tests hit a real Postgres, but a
dedicated one (`splitlab_test`), never the `splitlab` database you `curl` against by hand —
otherwise e2e runs would insert/delete real rows next to your own manual test data. This is
wired through `NODE_ENV`:

- `apps/api/.env.test` — same `DATABASE_URL` shape as `.env`, pointed at `splitlab_test`
  instead of `splitlab` (a single connection-string var, not discrete `DB_HOST`/`DB_PORT`/
  `DB_USER`/`DB_PASSWORD`/`DB_NAME` vars — that's the one env-var shape change from the Prisma
  swap). Gitignored (like `.env`), never committed.
- `AppModule`'s `ConfigModule.forRoot` picks `.env.test` over `.env` when `NODE_ENV=test`.
- `prisma.config.ts` (the standalone CLI-facing file) does the same, via `dotenv`'s
  `config({ path: ... })`.
- `pnpm run test:e2e` sets `NODE_ENV=test` before invoking Jest — this is the one thing that
  actually switches which database gets used; nothing else changes.

**Jest + Prisma's WASM query compiler:** booting the real `PrismaService` (as e2e tests do)
triggers Prisma 7's query-compiler loader, which uses a dynamic `import()` to load a WASM
module. Jest's default CJS test environment blocks bare dynamic `import()` with `A dynamic
import callback was invoked without --experimental-vm-modules` unless that Node flag is set —
this only surfaces once a test actually constructs a real `PrismaService` (the mocked unit
tests above never hit this, since they swap in a plain object and never call `$connect()`).
`test:e2e`'s script sets `NODE_OPTIONS=--experimental-vm-modules` for exactly this reason —
don't remove it, e2e tests fail immediately without it.

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
