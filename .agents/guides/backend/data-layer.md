# Back-end Data Layer (Prisma/Postgres)

## Entity organization

Schema lives in **one file**, `apps/api/prisma/schema.prisma` — not per-entity, unlike the
Drizzle-era `entities/<noun>/infrastructure/<noun>.schema.ts` layout. This is a real structural
loss, not a stylistic pick: Prisma's tooling (both the classic single-file layout and the
newer multi-file `prisma/schema/*.prisma` split) requires every model to live under
`apps/api/prisma/`, so per-entity co-location the way `entities/<noun>/infrastructure/` gave
Drizzle simply isn't achievable with Prisma regardless of which layout is chosen. Single-file
was picked on its own merits once co-location was off the table either way — one file is
easier to scan for relation ambiguity (a FK typo pointing at the wrong model) than juggling
several small files with cross-file `@relation` references.

`domain/<noun>.ts` (plain TS interface, no framework imports — `Project`, `FeatureFlag`, etc.)
is untouched by this swap; it was already framework-free and stays the source of truth for
what a service's return shape looks like. Keep it in sync with `schema.prisma` manually, same
discipline as before — a mismatch won't be caught by TypeScript since they're structurally
unrelated declarations.

**Relations must be declared on both sides in Prisma** — e.g. `Project` needs back-relation
array fields (`featureFlags FeatureFlag[]`, `experiments Experiment[]`) even though no query in
this codebase actually joins across entities today (every cross-entity check, like
`assertProjectExists`, is its own separate `findUnique` call in application code). This is new
ceremony compared to Drizzle's one-sided `projectId: uuid('projectId').references(() =>
projects.id)` — Prisma's schema validator rejects a FK-only declaration with no matching
back-relation field on the referenced model. Not a design choice on this project's part, just
what Prisma's schema language requires; doesn't change the "no repository layer, no
over-abstraction" philosophy from `api-patterns.md` — no actual join code exists anywhere.

**Generated client lives outside `src/`**: `apps/api/generated/prisma`, gitignored, regenerated
via `pnpm run db:generate` (`prisma generate`). This one decision avoids four separate problems
that would exist if it were emitted to `src/generated/prisma` instead: Jest's
`collectCoverageFrom: ["**/*.(t|j)s"]` would instrument the generated client and poison the
100%-coverage metric; the `lint` script's glob (`{src,apps,libs,test}/**/*.ts`) would try to
lint thousands of lines of generated code; `format` (`prettier --write "src/**/*.ts"`) would
rewrite it on every run; and `tsc --noEmit` would type-check it unnecessarily. A one-line
barrel, `apps/api/src/db/prisma-client.ts` (`export * from '../../generated/prisma/client'`),
re-exports it so the rest of the app still imports through the `@/*` tsconfig alias instead of
a relative `../../generated/...` path scattered across every service.

`PrismaService` (`src/db/prisma.service.ts`) replaces the `DRIZZLE`-token `DrizzleModule` — it
`extends PrismaClient`, is constructed with a `@prisma/adapter-pg` driver adapter (Prisma 7 has
no bundled query engine binary; the adapter is mandatory), and implements
`OnModuleInit`/`OnModuleDestroy` to `$connect()`/`$disconnect()` around the app's lifecycle —
the direct Nest-idiomatic replacement for the `Pool`/`pool.end()` handling the old
`drizzle.module.ts` factory and `db/migrate.ts` did by hand. `PrismaModule` (`@Global()`,
`src/db/prisma.module.ts`) provides+exports it directly — **no token, no `useFactory`**, unlike
`DRIZZLE`. See `nestjs-concepts.md` for why Prisma doesn't need a custom provider token the way
Drizzle did.

Every service that needs data access takes a bare constructor parameter —
`constructor(private readonly prisma: PrismaService) {}` — and calls a model as a property of
that one client instance: `this.prisma.project.findMany()`, `this.prisma.featureFlag.create({
data: {...} })`, etc. `src/db/schema.ts` (the old Drizzle re-export barrel) is gone entirely,
not migrated — Prisma's generated client already exposes every model
(`project`/`featureFlag`/`experiment`/`variant`/`event`) as a property of one client, nothing
left for a barrel to aggregate.

## Migration workflow

`prisma.config.ts` (apps/api root) is the structural analog of the old `drizzle.config.ts` —
schema location, migrations directory — separate from the Nest `PrismaModule` since the Prisma
CLI runs outside Nest entirely, same reason as before. It uses `dotenv`'s `config({ path: ...
})` directly (Nest's `ConfigModule` isn't running here either), switching to `.env.test` when
`NODE_ENV=test` — same pattern as everywhere else env selection happens in this project. One
real behavioral difference from Prisma 7: there's no `--schema`/`--url` CLI flag escape hatch
any more, so this conditional dotenv load inside `prisma.config.ts` is the *only* lever that
controls which database a Prisma CLI command targets.

Scripts (`apps/api/package.json`):
- `pnpm run db:generate` — `prisma generate`. Regenerates the client from `schema.prisma` into
  `apps/api/generated/prisma`. Wired into `turbo.json` as a `db:generate` task that
  `lint`/`typecheck`/`test`/`build` all `dependsOn`, so a fresh clone or CI run always
  generates the client before anything that needs it — doesn't touch the database, only reads
  the schema file.
- `pnpm run migration:generate` — `prisma migrate dev --create-only`. Diffs `schema.prisma`
  against the migrations history, writes a new SQL file under `prisma/migrations/`, does
  **not** apply it.
- `pnpm run migration:run` — `prisma migrate dev`. Applies any pending migration(s) to the dev
  DB and regenerates the client.
- `pnpm run migration:run:test` — `prisma migrate deploy` against `splitlab_test`
  (`NODE_ENV=test`). Non-interactive, no drift detection — the production/CI-safe apply
  command, appropriate here since e2e tests shouldn't ever get an interactive prompt.

**Workflow change worth knowing:** `prisma migrate dev --create-only` still connects to the
database (it provisions a throwaway shadow DB to compute the diff) — unlike `drizzle-kit
generate`, which was fully offline. **`migration:generate` now requires Docker (Postgres) to be
up**, where it didn't before.

There is no built-in down-migration/`migration:revert` — same accepted gap as before; if a
rollback is ever genuinely needed, hand-write a reverse SQL file.

**Always read a generated migration file before running it** — `migration:generate` is a
mechanical diff, not a judgment call; see the rename example below for exactly what it gets
wrong by default.

**On the multi-file schema question:** Prisma also supports splitting `schema.prisma` into
several files under `prisma/schema/*.prisma`. An older GitHub issue (#28673) reported real bugs
in that mode, but it's since been closed/fixed — it's not a live risk today. Single-file was
still the right call here, but on its own merits (see "Entity organization" above), not because
multi-file is broken.

## Why migrations, not `prisma db push`

Prisma has a `db push` command (push the current schema straight to the DB, no migration file,
no history) — it's Prisma's equivalent of TypeORM's `synchronize: true` and Drizzle's
`drizzle-kit push`, and the same argument against both applies here too. Concrete case:
`feature_flags` has 10,000 real rows in production. The team renames
`FeatureFlag.rolloutPercent` → `rolloutPct` in the schema, purely a naming cleanup.

**With `prisma db push`:**
```
Schema change: rolloutPercent → rolloutPct
        │
        ▼
Deploy, push runs against the live DB
        │
        ▼
Prisma diffs schema against live DB schema
        │
        ▼
Sees "rolloutPercent" gone from the schema, "rolloutPct" is new —
to Prisma these are two unrelated columns, not a rename
        │
        ▼
DROP COLUMN "rolloutPercent"      ← all 10,000 values gone
ADD COLUMN "rolloutPct" DEFAULT 0  ← every row now reads 0
        │
        ▼
No confirmation, no review, no rollback — happened live in prod
```

**With migrations:**
```
Schema change: rolloutPercent → rolloutPct
        │
        ▼
pnpm run migration:generate
        │
        ▼
Prisma writes the SQL to a FILE — same naive DROP+ADD, but nothing
has touched the real database yet
        │
        ▼
You read the file (this is the step that matters), see it would
drop real data, and hand-edit it:
   ALTER TABLE feature_flags RENAME COLUMN "rolloutPercent" TO "rolloutPct";
        │
        ▼
Commit the migration file — reviewable in a PR like any other code change
        │
        ▼
pnpm run migration:run — the exact same file runs on dev, staging, and
prod, in the same order, every time
        │
        ▼
10,000 rows keep their real values; only the column name changed
```

Prisma is equally naive in both paths — it proposes the same destructive diff either way. The
difference is entirely about *where* that mistake can be caught: `db push` applies it live,
silently, with no chance to intervene; a migration is a text file on disk you can read, fix, and
get reviewed before it ever touches real data. Bonus with migrations: every environment applies
the identical, ordered set of files, so dev/staging/prod schemas can't drift apart the way
independently-`push`ed local databases can.

## TODO — hands-on exercise: watch `prisma db push` actually destroy data

Do this once there's real seed data (a handful of `Project`/`FeatureFlag` rows created through
the actual API, not just a migration). The write-up above is the explanation; this is doing it
with your own hands so it's not just theory:

1. Seed a few rows via the API, note down real `rolloutPercent` values.
2. On a throwaway branch: rename `rolloutPercent` → `rolloutPct` in `schema.prisma`'s
   `FeatureFlag` model, run `npx prisma db push` against the dev DB.
3. Check the table — confirm the values are actually gone (`rolloutPct` reset to `0`).
4. Revert, do it the real way instead: `migration:generate`, read the generated file, hand-edit
   the `DROP`+`ADD` into a `RENAME COLUMN`, `migration:run`, confirm the values survived.

Delete this TODO once done — the point is doing it once, not keeping it as a checklist.
