# split-lab — Agent Instructions

Technical reference: commands, architecture, conventions. For roles, target stack rationale,
and milestones, see `CLAUDE.md`.

## Build & Development Commands

Task running goes through **Nx** (npm workspaces underneath, Nx adds caching + affected-only
runs — no framework-specific Nx plugins installed, this is plain task orchestration).

```bash
# Install dependencies (root, installs both workspaces + nx)
npm install

# Development
npm run dev:web              # Next.js dev server (apps/web)
npm run dev:api              # NestJS dev server (apps/api) — exists from M1 onward

# Code quality — runs across every project that has the target, cached, skips the rest
npx nx run-many -t lint typecheck test build

# Only re-run what's affected by your current changes vs main
npx nx affected -t lint typecheck test build

# Single project / single target
npx nx run web:build
npx nx run @split-lab/api:test    # once M1 adds a test script
```

**Requirements:** Node.js 20+, Docker (Postgres/Redis/RabbitMQ from M2 onward).

`apps/api` targets above don't exist yet — they land in M1 (NestJS skeleton). Once you add
`dev`/`lint`/`typecheck`/`test`/`build` scripts to `apps/api/package.json`, Nx and CI pick
them up automatically — nothing else to wire. Project name is `@split-lab/api` (from its
`package.json` `name` field), `web` for the frontend — confirm with `npx nx show projects`.

## Architecture

Monorepo, npm workspaces, one root git repo.

| Package    | What                                                    | Status                |
| ---------- | -------------------------------------------------------- | ---------------------- |
| `apps/web` | Next.js (App Router, TS, Tailwind) — UI only, no DB/logic | scaffolded (boilerplate) |
| `apps/api` | NestJS — all domain logic, DB, auth, queues               | not started (M1)       |

Import boundary: `apps/web` talks to `apps/api` only over HTTP (fetch calls to REST
endpoints). It never imports backend code, never touches the DB directly.

### apps/api (target shape, fills in per milestone)

- Modules/controllers/services/DTOs — standard NestJS structure, one module per domain
  concept (`ProjectsModule`, `FlagsModule`, `ExperimentsModule`, `EventsModule`).
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
