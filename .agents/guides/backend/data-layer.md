# Back-end Data Layer (TypeORM/Postgres)

## Entity organization

One folder per entity under `entities/<noun>/`, domain/infrastructure split (see
`api-patterns.md`): `domain/<noun>.ts` is a plain TS interface (no framework imports —
`Project`, `FeatureFlag`), `infrastructure/<noun>.entity.ts` has the real `@Entity()` class
with TypeORM decorators. Keep the two in sync manually — infrastructure is the DB-shape
implementation of what domain declares; a mismatch (e.g. `enabled: boolean` in domain but
`enabled: string` in the entity) defeats the whole point of the split and TypeScript won't
catch it for you since they're structurally unrelated types.

Relations: both the plain FK column (`projectId: string`) and the relation object
(`project: ProjectEntity` via `@ManyToOne` + `@JoinColumn({ name: 'projectId' })`) are
declared. The plain column lets you filter/query without a join; the relation lets you
`relations: ['project']` when you actually need the related row.

Each entity's `<noun>.module.ts` registers its repository via
`TypeOrmModule.forFeature([XEntity])` and re-exports `TypeOrmModule` so importing modules can
`@InjectRepository(XEntity)` — `forFeature` is per-module ("I need this specific repository
here"), distinct from the root `forRootAsync` in `app.module.ts` ("here's the DB connection
for the whole app"). Every new entity needs adding in three places: its own module file, the
`entities: [...]` array inside `app.module.ts`'s `TypeOrmModule.forRootAsync`, and the new
module added to `app.module.ts`'s `imports`.

## Migration workflow

`src/data-source.ts` is a standalone TypeORM `DataSource` config, separate from the Nest
`TypeOrmModule.forRootAsync` in `app.module.ts` — the TypeORM CLI runs outside Nest entirely
and can't read Nest-shaped config, so it needs its own. Uses `dotenv/config` directly (Nest's
`ConfigModule` isn't running here) and plain relative imports for entities (not the `@/` path
alias — the CLI runs through `ts-node`, which doesn't resolve TS path aliases unless told to;
fixed by adding a `"ts-node": { "require": ["tsconfig-paths/register"] }` block to
`tsconfig.json`, so this applies to any file the CLI touches, not just `data-source.ts`).

Scripts (`apps/api/package.json`):
- `pnpm run migration:generate -- src/migrations/<Name>` — diffs entities against the actual
  DB schema, writes the SQL to a new file. Doesn't touch the database.
- `pnpm run migration:run` — applies pending migrations, in order, tracked in a `migrations`
  table TypeORM creates for itself (so re-running is a no-op for already-applied ones).
- `pnpm run migration:revert` — undoes the last applied migration via its `down()`.

**Always read a generated migration file before running it** — `migration:generate` is a
mechanical diff, not a judgment call; see the rename example below for exactly what it gets
wrong by default.

## Why migrations, not `synchronize: true`

Concrete case: `feature_flags` has 10,000 real rows in production. The team renames
`FeatureFlag.rolloutPercent` → `rolloutPct` in the entity, purely a naming cleanup.

**With `synchronize: true`:**
```
Entity change: rolloutPercent → rolloutPct
        │
        ▼
Deploy, app restarts
        │
        ▼
TypeORM diffs entity against live DB schema
        │
        ▼
Sees "rolloutPercent" gone from the entity, "rolloutPct" is new —
to TypeORM these are two unrelated columns, not a rename
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
Entity change: rolloutPercent → rolloutPct
        │
        ▼
pnpm run migration:generate
        │
        ▼
TypeORM writes the SQL to a FILE — same naive DROP+ADD, but nothing
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

TypeORM is equally naive in both paths — it proposes the same destructive diff either way.
The difference is entirely about *where* that mistake can be caught: `synchronize` applies it
live, silently, with no chance to intervene; a migration is a text file on disk you can read,
fix, and get reviewed before it ever touches real data. Bonus with migrations: every
environment applies the identical, ordered set of files, so dev/staging/prod schemas can't
drift apart the way independently-`synchronize`d local databases can.

## TODO — hands-on exercise: watch `synchronize: true` actually destroy data

Do this once M3 (CRUD) exists and there's real seed data (a handful of `Project`/`FeatureFlag`
rows created through the actual API, not just the migration). The write-up above is the
explanation; this is doing it with your own hands so it's not just theory:

1. Seed a few rows via the M3 endpoints, note down real `rolloutPercent` values.
2. On a throwaway branch: rename `rolloutPercent` → `rolloutPct` in `FeatureFlagEntity`, flip
   `synchronize: true` temporarily in `data-source.ts`/`app.module.ts`, restart the app.
3. Check the table — confirm the values are actually gone (`rolloutPct` reset to `0`).
4. Revert, do it the real way instead: `migration:generate`, read the generated file, hand-edit
   the `DROP`+`ADD` into a `RENAME COLUMN`, `migration:run`, confirm the values survived.

Delete this TODO once done — the point is doing it once, not keeping it as a checklist.

## Known gotcha: pin `@nestjs/core`/`common`/`platform-express`/`testing` to `11.0.1`

`npm install` on a fresh M2 setup resolves `@nestjs/core` to its newest version (`11.1.28` at
the time this was hit), but `@nestjs/typeorm@11.0.3` (itself the newest available) breaks
against it — app boot throws:

```
UnknownDependenciesException: Nest can't resolve dependencies of the TypeOrmCoreModule
(TypeOrmModuleOptions, ?). Please make sure that the argument ModuleRef at index [1] is
available in the TypeOrmCoreModule module.
```

Not a config mistake — `ModuleRef` is a Nest-internal class that's normally always injectable
without any explicit import. Confirmed by directly resolving both packages' `require()` paths:
they pointed at the exact same on-disk `@nestjs/core`, so it wasn't a duplicate-copy problem
either. Bisecting versions was what worked: pinning `@nestjs/core`, `@nestjs/common`,
`@nestjs/platform-express`, `@nestjs/testing` down to `11.0.1` (exact, via `--save-exact` —
no `^`, so a routine `npm install` can't silently drift back to the broken combo) fixed it —
`TypeOrmCoreModule dependencies initialized` and `/health` responds normally. Revisit the pin
once a newer `@nestjs/typeorm` release exists and confirms compatibility with current
`@nestjs/core`.
