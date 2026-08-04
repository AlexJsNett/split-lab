# split-lab — Agent Instructions

Technical reference: commands, architecture, conventions. For roles, target stack rationale,
and milestones, see `CLAUDE.md`.

## Build & Development Commands

Task running goes through **Turborepo** (pnpm workspaces underneath, turbo adds caching +
affected-only runs via `--filter`). Package manager is **pnpm**, pinned via the
`packageManager` field in the root `package.json` (corepack-managed, not a global Homebrew
install — see `pnpm-workspace.yaml`'s `allowBuilds` note below).

```bash
# Install dependencies (root, installs both workspaces + turbo)
pnpm install

# Development (root-only script names, no ambiguity with workspace scripts)
pnpm dev:web              # Angular dev server (apps/web)
pnpm dev:api              # NestJS dev server (apps/api)

# Code quality — runs across every package that has the script, cached, skips the rest
# -w ("workspace root") is required here: these script names ALSO exist inside apps/*,
# and pnpm defaults to running a same-named script in every workspace package instead of
# the root's own script unless told explicitly which one you mean.
pnpm -w lint       # turbo run lint
pnpm -w typecheck  # turbo run typecheck
pnpm -w test       # turbo run test
pnpm -w build      # turbo run build

# Only re-run what's affected since a given ref
pnpm exec turbo run lint typecheck test build --filter="...[origin/main]"

# Single package
pnpm exec turbo run build --filter=web
pnpm exec turbo run test --filter=@split-lab/api
```

**Requirements:** Node.js 20+, Docker (Postgres/Redis/RabbitMQ from M2 onward).

Another pnpm-vs-npm gotcha, for any script that takes extra CLI args: npm swallows a `--`
separator before forwarding args to the script, pnpm forwards it **literally** as an extra
argument — which breaks yargs-based CLIs that don't expect a bare `--` in their argv. Fix:
don't use `--` with pnpm, pass the extra args directly to whatever script needs them.

Package name is `@split-lab/api` (from its `package.json` `name` field), `web` for the
frontend — both used with turbo's `--filter`.

`pnpm-workspace.yaml`'s `allowBuilds` block is pnpm's supply-chain gate: packages with an
install/postinstall script are ignored by default unless explicitly allowed. `sharp` and
`unrs-resolver` need their native binaries built (image processing, ESLint's resolver) so
they're `true`; `@nestjs/core`'s install script is just an opencollective funding notice, set
`false`. Revisit if a new dependency's build gets silently skipped — pnpm warns about it on
install.

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
| `apps/web` | Angular (standalone components, TS, built-in SSR) — UI only, no DB/logic | scaffolded (boilerplate)  |
| `apps/api` | NestJS — all domain logic, DB, auth, queues                         | M4 in progress (Projects/Flags/Variants/Experiments CRUD done) |

Import boundary: `apps/web` talks to `apps/api` only over HTTP (fetch calls to REST
endpoints). It never imports backend code, never touches the DB directly.

### apps/web tooling

Scaffolded via `ng new --ssr --style=css --routing` (Angular 22, standalone components — no
`NgModule` boilerplate). No styling/state-management library picked yet — plain CSS for now,
concrete choices (a component library, how server state gets fetched/cached — Angular's
`HttpClient` + signals is the native fit, no React-Query-equivalent forced) deferred to M6
when there are real screens to build against. Don't add either speculatively before M6.

### apps/api (target shape, fills in per milestone)

Folder architecture is FSD-inspired + screaming + clean-architecture-lite, not the default
Nest tutorial layout. Full convention and rationale: `.agents/guides/backend/api-patterns.md`
— read it before scaffolding M1, it decides where files go from the start.

- `entities/<noun>/` (domain + infrastructure) for things with a table behind them; `features/<verb>/` for use-cases that read/write them. No top-level `controllers/`/`services/`/`dto/` buckets.
- Drizzle schemas + migrations, no `drizzle-kit push` outside local scratch experiments.
- `class-validator` DTOs at the controller boundary — never trust raw request bodies past
  the DTO layer.
- Async work (event ingestion) goes through a queue (BullMQ/Redis first, RabbitMQ once a
  second service exists) — not inline in the request handler.

## Code Conventions

- **TypeScript strict mode** — no `any`; use `unknown` for untrusted input and validate with
  `class-validator`/DTOs before it's trusted.
- **RESTful design** — resource-oriented routes (`/projects/:id/flags`, not `/getFlags`),
  correct status codes (201 on create, 404 vs 400 distinction, etc.), no verbs in URLs.
- **Testing policy** — 100% test coverage, every milestone. Unit tests for services/logic
  (branching, variant assignment, etc.) AND thin controllers/DTOs too — deliberate choice
  over the usual "skip trivial delegates" advice, because the extra e2e/mock practice on
  simple code is itself part of what this project trains. Write tests alongside each
  milestone's code, not deferred to M8.
- **Errors** — throw Nest's built-in HTTP exceptions (`NotFoundException`, etc.) from
  services, don't hand-roll status codes in controllers.
- **Env vars** — read through a config module (`@nestjs/config`), never scattered
  `process.env` reads.

## Detailed Guidance

Read the relevant guide before starting that milestone. Guides start as stubs and get filled
in as the milestone they cover actually lands — a stub with "not written yet, land in Mx"
is the honest state, not a placeholder to ignore.

- Project structure: `.agents/guides/project-overview.md`
- NestJS core concepts (DI, decorators, modules — the "why"): `.agents/guides/backend/nestjs-concepts.md`
- Back-end API patterns (NestJS/REST): `.agents/guides/backend/api-patterns.md`
- Back-end data layer (Drizzle/Postgres): `.agents/guides/backend/data-layer.md`
- Back-end testing (Jest): `.agents/guides/backend/testing.md`
- Security (OWASP Top 10 mapped to this project's actual surface): `.agents/guides/backend/security.md`
- Async processing & messaging (BullMQ/RabbitMQ): `.agents/guides/backend/messaging.md`
- Front-end data fetching: `.agents/guides/frontend/data-fetching.md`
