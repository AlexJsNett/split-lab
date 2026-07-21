# split-lab Project Overview

Feature-flag / A/B-testing platform. See root `CLAUDE.md` for the full target stack and
milestone list — this file is the living architecture snapshot, updated as milestones land.

## Monorepo Structure (npm workspaces)

- **`apps/web`** — Next.js app, UI only. Port 3000 in dev.
- **`apps/api`** — NestJS API server. Domain logic, DB, auth, queues. Port TBD (set in M1).

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

- [x] M1–M8 groundwork not started — see `CLAUDE.md` milestones.
- This section should be updated (which milestone is current, what changed structurally)
  whenever a milestone that touches architecture lands — not left stale.
