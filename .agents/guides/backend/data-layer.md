# Back-end Data Layer (Drizzle/Postgres)

## Entity organization

One folder per entity under `entities/<noun>/`, domain/infrastructure split (see
`api-patterns.md`): `domain/<noun>.ts` is a plain TS interface (no framework imports —
`Project`, `FeatureFlag`), `infrastructure/<noun>.schema.ts` has the real Drizzle table
definition — a plain exported `pgTable(...)` const, no class, no decorators. Keep the two in
sync manually — infrastructure is the DB-shape implementation of what domain declares; a
mismatch (e.g. `enabled: boolean` in domain but a `varchar` column in the schema) defeats the
whole point of the split and TypeScript won't catch it for you since they're structurally
unrelated declarations.

Relations: the FK column declares its own reference inline —
`projectId: uuid('projectId').notNull().references(() => projects.id)` — there's no separate
relation object/property the way TypeORM's `@ManyToOne` + `@JoinColumn` needed two things
(a column and a relation property). Drizzle only builds a joined relation when a query
explicitly asks for one (via its `relations()` API or a manual `.leftJoin(...)`) — the schema
alone just declares the foreign key constraint for the database and for query type-checking.

There is no per-entity module and no `forFeature`-style repository registration. A single
`DrizzleModule` (`src/db/drizzle.module.ts`), marked `@Global()`, provides one DB client under
a `DRIZZLE` injection token — every service that needs data access just
`@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>` in its constructor and
queries directly (`this.db.select().from(projects).where(...)`), no repository wrapper. A new
entity needs adding in two places: its own `<noun>.schema.ts`, and re-exported from
`src/db/schema.ts` (the barrel the `DrizzleModule` factory builds the typed client from).

## Migration workflow

`drizzle.config.ts` (apps/api root) is drizzle-kit's own config — schema glob, output
directory, DB credentials — separate from the Nest `DrizzleModule`, since drizzle-kit runs
outside Nest entirely as its own CLI, same reason the old TypeORM CLI needed a standalone
`data-source.ts`. Uses `dotenv`'s `config({ path: ... })` directly (Nest's `ConfigModule` isn't
running here), switching to `.env.test` when `NODE_ENV=test` — same pattern as everywhere else
env selection happens in this project.

Scripts (`apps/api/package.json`):
- `pnpm run migration:generate` — diffs the schema files (`src/entities/**/infrastructure/
  *.schema.ts`) against the last-known snapshot, writes a new SQL file under `src/migrations/`.
  Doesn't touch the database.
- `pnpm run migration:run` — applies pending migrations to the dev DB.
- `pnpm run migration:run:test` — the same, against `splitlab_test` (`NODE_ENV=test`).

**Known gotcha:** `drizzle-kit migrate` (the CLI's own apply command) failed silently in this
project's setup — no usable error, just a stuck spinner and a non-zero exit. Calling
`drizzle-orm`'s `migrate()` function directly (same underlying mechanism, just not through the
CLI wrapper) worked immediately with the identical config. `migration:run`/`migration:run:test`
now run a small hand-written `src/db/migrate.ts` via `ts-node` instead of `drizzle-kit
migrate` — `migration:generate` still uses the drizzle-kit CLI since that command worked fine.
Revisit if a `drizzle-kit` update fixes the CLI `migrate` path; no reason not to consolidate on
the CLI once it actually works.

There is no built-in down-migration/`migration:revert` — drizzle-kit only generates forward
SQL from a schema diff. Accepted gap for this project's size; if a rollback is ever genuinely
needed, hand-write a reverse SQL file.

**Always read a generated migration file before running it** — `migration:generate` is a
mechanical diff, not a judgment call; see the rename example below for exactly what it gets
wrong by default.

## Why migrations, not `drizzle-kit push`

Drizzle has a `push` command (push the current schema straight to the DB, no migration file,
no history) — it's Drizzle's equivalent of TypeORM's `synchronize: true`, and the same
argument against `synchronize` applies to it. Concrete case: `feature_flags` has 10,000 real
rows in production. The team renames `FeatureFlag.rolloutPercent` → `rolloutPct` in the schema,
purely a naming cleanup.

**With `drizzle-kit push`:**
```
Schema change: rolloutPercent → rolloutPct
        │
        ▼
Deploy, push runs against the live DB
        │
        ▼
drizzle-kit diffs schema against live DB schema
        │
        ▼
Sees "rolloutPercent" gone from the schema, "rolloutPct" is new —
to drizzle-kit these are two unrelated columns, not a rename
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
drizzle-kit writes the SQL to a FILE — same naive DROP+ADD, but nothing
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

drizzle-kit is equally naive in both paths — it proposes the same destructive diff either way.
The difference is entirely about *where* that mistake can be caught: `push` applies it live,
silently, with no chance to intervene; a migration is a text file on disk you can read, fix,
and get reviewed before it ever touches real data. Bonus with migrations: every environment
applies the identical, ordered set of files, so dev/staging/prod schemas can't drift apart the
way independently-`push`ed local databases can.

## TODO — hands-on exercise: watch `drizzle-kit push` actually destroy data

Do this once there's real seed data (a handful of `Project`/`FeatureFlag` rows created through
the actual API, not just a migration). The write-up above is the explanation; this is doing it
with your own hands so it's not just theory:

1. Seed a few rows via the API, note down real `rolloutPercent` values.
2. On a throwaway branch: rename `rolloutPercent` → `rolloutPct` in `feature-flag.schema.ts`,
   run `npx drizzle-kit push` against the dev DB.
3. Check the table — confirm the values are actually gone (`rolloutPct` reset to `0`).
4. Revert, do it the real way instead: `migration:generate`, read the generated file, hand-edit
   the `DROP`+`ADD` into a `RENAME COLUMN`, `migration:run`, confirm the values survived.

Delete this TODO once done — the point is doing it once, not keeping it as a checklist.
