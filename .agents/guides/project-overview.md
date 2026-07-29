# split-lab Project Overview

Feature-flag / A/B-testing platform. See root `CLAUDE.md` for roles/working agreement,
`.agents/project/target-stack.md` for the job-requirement rationale, and
`.agents/project/milestones.md` for the full milestone list. This file is the living
architecture snapshot, updated as milestones land.

## Monorepo Structure (pnpm workspaces)

```
split-lab/
  apps/
    web/   Angular — frontend ONLY. Talks to apps/api over HTTP. No DB access, no business logic.
    api/   NestJS — backend. All domain logic, DB, auth, queues live here.
  .github/workflows/ci.yml
```

- **`apps/web`** — Angular app (standalone components, Angular Router, built-in SSR), UI only.
  Boilerplate until M6, then real screens. Port 4200 in dev (Angular's default; not 3000 —
  don't confuse with `apps/api`'s port when both are running).
- **`apps/api`** — NestJS API server. Domain logic, DB, auth, queues. Tech choices, fixed by
  the target stack (not a free pick):
  - Framework: **NestJS** (modules/controllers/providers/DI — this structure is the point)
  - ORM: **Drizzle**
  - Primary DB: **PostgreSQL**
  - Cache / queue backing: **Redis**
  - Message broker: **RabbitMQ** (BullMQ-on-Redis first as a warm-up, then RabbitMQ for the
    real message-broker experience)
  - Testing: **Jest**
  - Containerization: **Docker** (docker-compose for Postgres + Redis + RabbitMQ locally)

## Domain model

```
Project        (id, name, apiKey)
FeatureFlag    (id, projectId, key, enabled, rolloutPercent)
Experiment     (id, projectId, flagId?, name, status: draft|running|completed)
Variant        (id, experimentId, key, weight)
Event          (id, experimentId, variantId, userId, type: exposure|conversion)
```

Deterministic bucketing: same `userId` always maps to the same variant for a given
experiment — hash `experimentId:userId`, bucket = hash mod 100, compare against cumulative
variant weights.

**M4 assignment endpoint — concept note (pending implementation, explain when picked up)**:
1. Key: `experimentId + ':' + userId` — separator matters, avoids collisions
   (`"exp1"+"1"+"userA"` vs `"exp11"+"userA"`).
2. Hash the key to a number (FNV/djb2 string hash, or `crypto.createHash('md5')` + take
   leading bytes as int) — need reasonably uniform distribution.
3. `bucket = hash % 100` → 0-99.
4. Sort variants **deterministically** (by id or key — not DB insertion order, which isn't
   guaranteed stable), walk them accumulating weight, first variant where
   `bucket < cumulativeWeight` wins. Weights already validated to sum to 100 on the
   draft→running transition (M3/M4 CRUD).
5. Must be a **pure function** — (experimentId, userId, variants[]) → variant, no side
   effects, no `Math.random()` (non-deterministic, breaks repeat-visit consistency). This is
   exactly what makes it trivial to unit test in isolation — the milestone note about an
   "AssignmentService easy to unit test" is pointing at this property.

## Status

- [x] M1 — NestJS skeleton done (`GET /health`, `dev:api` wired).
- [x] M2 — Data layer done. Postgres in Docker, `Project`/`FeatureFlag`/`Experiment`/
      `Variant`/`Event` schemas + migrations applied.
- [x] M3 — Projects & Flags CRUD done. `Project` (hashed `apiKey`) and `FeatureFlag`
      (nested under `/projects/:projectId/flags`, scoped queries to prevent IDOR) CRUD,
      full unit test coverage on both services.
- [ ] M4 — Experiments & assignment — current. `Experiment`/`Variant` CRUD done (same
      scoped-query pattern, plus a `draft`→`running` transition that validates variant
      weights sum to 100); the deterministic assignment endpoint is next. See
      `.agents/project/milestones.md` for M5+.
- Data layer switched from TypeORM to Drizzle mid-M4 (developer's choice — see
  `milestones.md`'s "Stretch — Prisma exposure" entry for the reasoning trail). All 4
  services rewritten on the new query client, same route/response shape, no API contract
  changes for consumers.
- This section should be updated (which milestone is current, what changed structurally)
  whenever a milestone that touches architecture lands — not left stale.
