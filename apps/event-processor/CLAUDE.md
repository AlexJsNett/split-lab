@../../AGENTS.md

# apps/event-processor — local conventions

Cross-cutting build/git/architecture conventions live in the root `AGENTS.md` (included
above) — this file is only what's specific to working inside `apps/event-processor`.

## Folder architecture

Mirrors `apps/api`'s FSD conventions exactly (same `@/*` alias, same eslint/prettier/Jest
setup) — see `apps/api/CLAUDE.md` and `.agents/guides/backend/api-patterns.md` for the full
rationale, not repeated here. Owns its own `DrizzleModule` + a minimal `events` pgTable with
no `.references()` — `apps/api` keeps sole ownership of migrations; a column-parity unit test
(`event.schema.spec.ts`) is the tripwire against the two definitions drifting.

## What makes this app different from apps/api

- **Hybrid app** (M13, D4): `NestFactory.create()` + `connectMicroservice()`, HTTP only exists
  for `GET /health`, ordered so `app.listen()` only opens after `startAllMicroservices()`
  resolves — see `.agents/guides/backend/docker.md`.
- **Sole owner of the RabbitMQ topology** (`src/messaging/topology.ts` +
  `assert-topology.ts`, asserted at boot) — `apps/api`'s producers publish with
  `noAssert: true` so this worker's topology declaration is the only one that exists. Full
  reasoning: `.agents/guides/backend/messaging.md`.
- No HTTP routes besides `/health` — no `ApiKeyGuard`, no `@Public()` decorator needed here.
