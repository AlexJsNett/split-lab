# split-lab

Feature-flag / A/B-testing platform. Direction: growthbook.io-inspired (feature flags, experiments, rollout %, results), own scope, not a clone.

## Roles

- **You (developer)**: write all application code — `apps/api` in full, and later the real
  screens in `apps/web`. This is your Node.js + fullstack practice ground.
- **Claude (project manager)**: breaks work into milestones, reviews your code when asked,
  answers "how do I approach X" questions, owns tooling/CI config. Does not write business
  logic in `apps/api` or `apps/web` unless you explicitly ask for that milestone to be handed
  over. Default is: you write it, Claude reviews it.

Ask for a review with `/code-review` (or "review my API code") after each milestone below —
don't wait until the whole thing is done.

## Architecture

Monorepo, npm workspaces, one root git repo.

```
split-lab/
  apps/
    web/   Next.js — frontend ONLY. Talks to apps/api over HTTP. No DB access, no business logic.
    api/   Node.js — backend. All domain logic, DB, auth live here. <- your practice ground
  .github/workflows/ci.yml
```

`apps/web` is already scaffolded (create-next-app, TS + Tailwind + App Router). Treat it as
plain boilerplate — replace the default page with real screens only in later milestones.

`apps/api` is intentionally empty except for a placeholder `package.json`. You choose the
framework (Express, Fastify, Hono, plain `node:http` — pick based on what you want to learn)
and build it up milestone by milestone.

## Domain model (target)

```
Project        (id, name, apiKey)
FeatureFlag    (id, projectId, key, enabled, rolloutPercent)
Experiment     (id, projectId, flagId?, name, status: draft|running|completed)
Variant        (id, experimentId, key, weight)
Event          (id, experimentId, variantId, userId, type: exposure|conversion)
```

Core mechanic worth understanding before you build it: **deterministic bucketing** — the same
`userId` must always land in the same variant for a given experiment, without needing to store
an assignment row ahead of time. Typical approach: hash `experimentId:userId`, take the hash
mod 100, compare against cumulative variant weights. Look this up / derive it yourself rather
than asking for the snippet — it's a good exercise.

## Milestones

Work through these roughly in order. Each one should end in something runnable.

- [ ] **M1 — API skeleton**: pick a framework, `GET /health` returns 200, dev script with
      hot reload, TypeScript configured. Wire `dev:api` at the root to run it.
- [ ] **M2 — Data layer**: pick a DB (SQLite is enough for local dev) and an approach
      (raw SQL, an ORM like Prisma/Drizzle — pick one you want practice with). Model
      `Project` and `FeatureFlag` first.
- [ ] **M3 — Projects & Flags CRUD**: create/list projects, create/list/toggle flags,
      input validation (e.g. zod), meaningful error responses.
- [ ] **M4 — Experiments & assignment**: experiments + variants CRUD, the deterministic
      assignment endpoint (`GET /experiments/:id/assign?userId=`), log an exposure event
      on assignment.
- [ ] **M5 — Conversion tracking & results**: `POST /events` for conversions, an aggregation
      endpoint that returns per-variant exposure count, conversion count, conversion rate.
- [ ] **M6 — Frontend wired to the real API**: replace the Next.js boilerplate with a
      dashboard that lists projects/flags/experiments and shows results. Frontend stays
      dumb — no logic Next.js doesn't need.
- [ ] **M7 — Auth**: API key middleware on `apps/api` (the `Project.apiKey` field already
      fits this), reject unauthenticated requests.
- [ ] **M8 — Tests**: pick a test runner, cover the assignment/bucketing logic first since
      it's the trickiest bit to get right.
- [ ] **M9 — CI hardening**: add a test gate to CI, add path-based triggers so web/api build
      independently. CD (actual deploy) is a later decision once you've picked hosting.

## Tooling already in place

- Root npm workspaces (`apps/*`)
- `npm run dev:web` — Next.js dev server
- `npm run dev:api` — will run once `apps/api/package.json` has a `dev` script (M1)
- `.github/workflows/ci.yml` — install, lint, typecheck, build on every push/PR (see below)
- `.gitignore` set up for node_modules, `.next`, `dist`, `.env`, sqlite db files

## Working agreement

- Don't ask Claude to "just write the API" — ask for the milestone breakdown, a review, or
  an explanation of a concept instead.
- When stuck for a while (not immediately), it's fine to ask for a hint or to see how a
  specific pattern is usually done — just say so explicitly so Claude knows it's a
  deliberate exception, not the default mode.
