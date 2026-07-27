# split-lab Project Overview

Feature-flag / A/B-testing platform. See root `CLAUDE.md` for roles/working agreement,
`.agents/project/target-stack.md` for the job-requirement rationale, and
`.agents/project/milestones.md` for the full milestone list. This file is the living
architecture snapshot, updated as milestones land.

## Monorepo Structure (pnpm workspaces)

```
split-lab/
  apps/
    web/   Next.js — frontend ONLY. Talks to apps/api over HTTP. No DB access, no business logic.
    api/   NestJS — backend. All domain logic, DB, auth, queues live here.
  .github/workflows/ci.yml
```

- **`apps/web`** — Next.js app (App Router, TS, Tailwind, shadcn/ui, React Query), UI only.
  Boilerplate until M6, then real screens. Port 3000 in dev.
- **`apps/api`** — NestJS API server. Domain logic, DB, auth, queues. Tech choices, fixed by
  the target stack (not a free pick):
  - Framework: **NestJS** (modules/controllers/providers/DI — this structure is the point)
  - ORM: **TypeORM**
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

## Status

- [x] M1 — NestJS skeleton done (`GET /health`, `dev:api` wired).
- [x] M2 — Data layer done. Postgres in Docker, TypeORM connected, `Project`/`FeatureFlag`
      entities + first migration (`InitSchema`) applied.
- [ ] M3 — Projects & Flags CRUD — current. See `.agents/project/milestones.md` for M4+.
- This section should be updated (which milestone is current, what changed structurally)
  whenever a milestone that touches architecture lands — not left stale.
