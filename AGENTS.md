# split-lab — Agent Instructions

Technical reference: commands, architecture, conventions. For roles, target stack rationale,
and milestones, see `CLAUDE.md`.

## Build & Development Commands

Task running goes through **Turborepo** (npm workspaces underneath, turbo adds caching +
affected-only runs via `--filter`).

```bash
# Install dependencies (root, installs both workspaces + turbo)
npm install

# Development
npm run dev:web              # Next.js dev server (apps/web)
npm run dev:api              # NestJS dev server (apps/api) — exists from M1 onward

# Code quality — runs across every package that has the script, cached, skips the rest
npm run lint       # turbo run lint
npm run typecheck  # turbo run typecheck
npm run test       # turbo run test
npm run build      # turbo run build

# Only re-run what's affected since a given ref
npx turbo run lint typecheck test build --filter="...[origin/main]"

# Single package
npx turbo run build --filter=web
npx turbo run test --filter=@split-lab/api   # once M1 adds a test script
```

**Requirements:** Node.js 20+, Docker (Postgres/Redis/RabbitMQ from M2 onward).

`apps/api` scripts above don't exist yet — they land in M1 (NestJS skeleton). Once you add
`dev`/`lint`/`typecheck`/`test`/`build` scripts to `apps/api/package.json`, turbo and CI pick
them up automatically — nothing else to wire, as long as the task name matches an entry in
`turbo.json`. Package name is `@split-lab/api` (from its `package.json` `name` field), `web`
for the frontend.

`.turbo/` is gitignored — its per-task log files change every run, and if they aren't
ignored they end up hashed as task inputs and silently defeat the cache.

## Git & GitHub

Local history stays plain `git` (`add`/`commit`/`branch`/`push`/`merge` — `gh` doesn't
replace any of that). Everything that talks to GitHub itself goes through **`gh`** instead of
the browser or raw API calls:

```bash
gh repo view                          # repo info instead of opening the browser
gh pr create / gh pr view / gh pr diff
gh issue create / gh issue list
gh auth status                        # already logged in as AlexJsNett
```

Repo: `git@github.com:AlexJsNett/split-lab.git` (`origin`, `main`).

## Architecture

Monorepo, npm workspaces, one root git repo.

| Package    | What                                                              | Status                    |
| ---------- | ------------------------------------------------------------------ | -------------------------- |
| `apps/web` | Next.js (App Router, TS) + Tailwind + shadcn/ui + React Query — UI only, no DB/logic | scaffolded (boilerplate)  |
| `apps/api` | NestJS — all domain logic, DB, auth, queues                         | not started (M1)           |

Import boundary: `apps/web` talks to `apps/api` only over HTTP (fetch calls to REST
endpoints). It never imports backend code, never touches the DB directly.

### apps/web tooling

- **shadcn/ui** on top of Tailwind — components get added on demand with
  `npx shadcn@latest add <component>` (writes into `src/components/ui/`), not hand-rolled.
- **React Query** (`@tanstack/react-query`) for all server state — every read from `apps/api`
  goes through a query hook, every write through a mutation hook. Not Redux: there's no
  significant client-only state here, this app is a dashboard over REST resources, and
  Query already handles caching/invalidation/refetch for exactly that shape. Revisit only if
  real cross-cutting client state shows up that Query genuinely can't model (rare for this
  app's scope). Provider is wired in `src/app/providers.tsx` — already in place, M6 just
  adds real query hooks against it.

### apps/api (target shape, fills in per milestone)

Folder architecture is FSD-inspired + screaming + clean-architecture-lite, not the default
Nest tutorial layout. Full convention and rationale: `.agents/guides/backend/api-patterns.md`
— read it before scaffolding M1, it decides where files go from the start.

- `entities/<noun>/` (domain + infrastructure) for things with a table behind them; `features/<verb>/` for use-cases that read/write them. No top-level `controllers/`/`services/`/`dto/` buckets.
- TypeORM entities + migrations, no `synchronize: true` outside local scratch experiments.
- `class-validator` DTOs at the controller boundary — never trust raw request bodies past
  the DTO layer.
- Async work (event ingestion) goes through a queue (BullMQ/Redis first, RabbitMQ once a
  second service exists) — not inline in the request handler.

## Code Conventions

- **TypeScript strict mode** — no `any`; use `unknown` for untrusted input and validate with
  `class-validator`/DTOs before it's trusted.
- **RESTful design** — resource-oriented routes (`/projects/:id/flags`, not `/getFlags`),
  correct status codes (201 on create, 404 vs 400 distinction, etc.), no verbs in URLs.
- **Testing policy** — unit-test service/logic classes (especially anything with branching,
  like variant assignment); don't chase coverage on thin controllers that just delegate.
- **Errors** — throw Nest's built-in HTTP exceptions (`NotFoundException`, etc.) from
  services, don't hand-roll status codes in controllers.
- **Env vars** — read through a config module (`@nestjs/config`), never scattered
  `process.env` reads.

## Detailed Guidance

Read the relevant guide before starting that milestone. Guides start as stubs and get filled
in as the milestone they cover actually lands — a stub with "not written yet, land in Mx"
is the honest state, not a placeholder to ignore.

- Project structure: `.agents/guides/project-overview.md`
- Back-end API patterns (NestJS/REST): `.agents/guides/backend/api-patterns.md`
- Back-end data layer (TypeORM/Postgres): `.agents/guides/backend/data-layer.md`
- Back-end testing (Jest): `.agents/guides/backend/testing.md`
- Async processing & messaging (BullMQ/RabbitMQ): `.agents/guides/backend/messaging.md`
- Front-end data fetching: `.agents/guides/frontend/data-fetching.md`
