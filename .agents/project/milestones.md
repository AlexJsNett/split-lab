# Milestones

Work through these roughly in order. Each one should end in something runnable. Milestones
from M9 onward map directly to specific lines in `target-stack.md` — that's deliberate.

`CLAUDE.md` tracks only the current milestone; this file is the full list — open it when
planning the next one or checking what's still ahead.

- [x] **M1 — NestJS skeleton**: `nest new`, `GET /health` returns 200, TypeScript configured,
      dev script with hot reload. Wire `dev:api` at the root to run it.
- [x] **M2 — Data layer**: Docker Compose with a Postgres container, Drizzle connected,
      schemas for `Project` and `FeatureFlag`, migrations (not `drizzle-kit push`).
- [x] **M3 — Projects & Flags CRUD**: NestJS controllers/services/DTOs, `class-validator`
      input validation, meaningful error responses (RESTful conventions — status codes,
      resource-oriented routes).
- [x] **M4 — Experiments & assignment**: experiments + variants CRUD, the deterministic
      assignment endpoint (`GET /experiments/:id/assign?userId=`), log an exposure event
      on assignment. Apply SOLID where it's actually warranted (e.g. an `AssignmentService`
      that's easy to unit test in isolation) — don't force patterns where they don't fit.
      Done: `AssignVariantService` + pure `assignVariant()` domain function (hash key →
      bucket → cumulative-weight walk), full unit coverage (37 tests total across the API).
- [x] **Stretch — Prisma exposure** — resolved differently than originally planned, but
      done. The bounded ports-and-adapters version below was superseded mid-M4 by a full
      Drizzle→Prisma rewrite (developer's explicit call, overriding the "one entity is
      enough" reasoning) — real, tested, working Prisma code exists in git history at
      commit `1450a07`. After hands-on time with it, developer found Prisma's generated-client
      layer added real friction (`.js`-extension resolution, webpack/jest config workarounds)
      compared to Drizzle's directness, and asked to revert — done at commit `0495928`, back
      on Drizzle, which is what's running now. Net result: genuine Prisma exposure happened
      (satisfies the `target-stack.md` line), informed opinion formed on the tradeoff, and
      Drizzle stays primary. ~~Pick ONE entity (`Project`), define a `ProjectRepositoryPort`
      interface in `domain/`, implement it twice...~~ — no longer needed, superseded by the
      above.
- [x] **M5 — Conversion tracking & results**: `POST /events` for conversions, an aggregation
      endpoint that returns per-variant exposure count, conversion count, conversion rate.
      Done: `log-conversion` (`POST /projects/:projectId/experiments/:id/conversions`, reuses
      the variantId from the user's prior exposure event) and `get-results`
      (`GET /projects/:projectId/experiments/:id/results`, `count()`+`groupBy()` aggregation,
      zero-fills variants with no events), full unit coverage.
- [x] **M6 — Frontend wired to the real API**: replace the Next.js boilerplate with a
      dashboard that lists projects/flags/experiments and shows results. Frontend stays
      dumb — no logic beyond what the dashboard actually needs.
      Done: read-only dashboard (`/`, `/projects/[id]`, `/projects/[id]/experiments/[id]`),
      shadcn table/badge/card, `app/_shared/{ui,lib}` FSD layer, server-component `fetch`,
      no auth/forms yet (M7 added auth after).
- [x] **M7 — Auth**: API key guard in Nest (the `Project.apiKey` field already fits this),
      reject unauthenticated requests.
      Done: `ApiKeyGuard` (global via `APP_GUARD`, `x-api-key` header, sha256 hash lookup,
      `@Public()` bypass) + `ProjectOwnershipGuard` (IDOR protection, `@ProjectIdParam()`
      metadata, `@AuthProject()` param decorator), `GET /projects` scoped to caller's own
      project, full unit coverage on both guards (62/62 tests total).
- [x] **M8 — Tests**: Jest unit tests, starting with the assignment/bucketing logic since
      it's the trickiest bit to get right. Add a couple of e2e tests with Nest's test utils.
      (Note: as of the 100% coverage policy, tests land alongside every milestone, not
      deferred to here — this milestone is really "close any remaining gaps.")
      Done: unit coverage was already complete from prior milestones (62/62). This milestone
      closed the actual gap — real e2e coverage. The M1-era stale `/health` e2e spec (route
      deleted in M7) got replaced with 4 real spec files hitting the actual `AppModule` +
      `splitlab_test` Postgres through `supertest`: `projects`, `flags`, `auth` (guards
      through real HTTP, not mocked `ExecutionContext`), `experiment-lifecycle` (variants ->
      assign -> conversion -> results golden path). Found and fixed a real bug along the way:
      `DrizzleModule` never closed its `pg.Pool` on shutdown — harmless for a long-running
      server, but left e2e test files hanging on an open handle. `test:e2e` now runs
      `--runInBand`, since all 4 files share one real database and Jest's default parallel
      workers raced each other's `TRUNCATE`s otherwise. 13/13 e2e passing, 75 tests total
      across the API.
- [ ] **M9 — Redis + async events**: move event ingestion off the request/response path —
      publish exposure/conversion events to a Redis-backed BullMQ queue, process them in a
      worker. This is the "asynchronous processing" line from the target list.
- [ ] **M10 — RabbitMQ + a second service**: split event processing into its own NestJS
      microservice, communicating with the main API over RabbitMQ instead of BullMQ. This is
      the SOA/microservices + message-broker line — inter-service comms, not just a queue.
- [ ] **M11 — Third-party REST integration**: pick one real external API to integrate
      (e.g. push experiment results to a Slack webhook, or pull enrichment data for events).
      Build it properly: auth, rate-limit handling, retries with backoff, idempotency keys
      on the outbound calls. This maps directly to the "integration with third-party REST
      APIs" requirement — don't skip the retry/idempotency part, that's the actual skill
      being tested.
- [ ] **M12 — Second datastore (pick one)**: Elasticsearch for full-text search over
      experiments/flags, or MongoDB for the raw event log (polyglot persistence — Postgres
      stays the source of truth for entities, Mongo/ES hold something Postgres is a bad fit
      for). Pick based on which one you're weaker on.
- [ ] **M13 — Docker Compose for the whole stack**: API + worker/microservice + web +
      Postgres + Redis + RabbitMQ + chosen second datastore, one `docker-compose up`.
- [ ] **M14 — CI hardening + AWS**: test gate in CI, path-based triggers so web/api build
      independently. Then a real deploy target on AWS (EC2 for the containers, S3 for static
      assets, Lambda if a piece of this naturally fits serverless) — this is explicitly a
      "plus," treat it as the stretch milestone once M1–M13 are solid.
- [ ] **M15 — Client SDK**: a small npm package (`packages/sdk` or standalone), modeled after
      GrowthBook's JS/Node SDK — deliberately copy the shape to learn it, not to reinvent it.
      Fetches flag/experiment config from `apps/api` for a project (by `apiKey`), does the
      deterministic bucketing **locally** (no round-trip per evaluation), exposes something
      like `client.isOn('flag-key')` / `client.getExperimentVariant(id, userId)`. Config
      caching + a refresh/poll interval. This is the actual "SDK" skill GrowthBook is known
      for — the hard part is local evaluation matching server-side bucketing exactly.
- [ ] **M16 — Analytics / results dashboard**: push `apps/web` results screens closer to
      GrowthBook's actual results UI — per-variant exposures/conversions/conversion rate
      (already have the numbers from M5), plus a simple confidence indicator or interval,
      and a time-series view of exposures/conversions over the experiment's run. Copy
      GrowthBook's layout/approach as closely as practical to learn from it first; diverge
      once you have your own ideas about what's missing or worth doing differently.

## Backlog — not tied to a specific milestone yet

- **`apps/web` e2e tests (Playwright)**: real browser hitting a real running `pnpm dev:web` →
  `pnpm dev:api` → Postgres — not unit tests, since the current pages are Server Components
  with zero branching/logic (fetch + render), where unit tests would just be testing
  React/Next.js itself. Low ROI right now with only 3 read-only pages from M6's first pass —
  revisit once there's more UI (especially once forms/mutations exist, where there's actual
  logic worth covering). This is the deploy-time check — runs once per change, against the
  test DB, same shape as `apps/api`'s own `test:e2e`.
- **Production synthetic monitoring** (belongs with M14, once a real AWS prod environment
  exists — doesn't apply yet, there's no prod, only local dev + `splitlab_test`): a scheduled
  job (every few minutes) running a full-journey script against the *real* prod system —
  signup → log out → log in → exercise a small **critical/golden-path** subset of
  functionality (not the whole app — keep this fast and cheap to run continuously, unlike the
  exhaustive e2e suite) → delete the account. Two safety requirements: (1) the synthetic
  account needs an identifiable pattern (e.g. `synthetic-monitor+<timestamp>@...`) plus a
  separate cleanup sweep job, so a mid-run crash before the delete step doesn't leave junk
  data behind; (2) this is layered on top of, not instead of, a plain `GET /health` heartbeat
  check (already exists from M1) — health check is cheap/frequent, full-journey synthetic is
  heavier/less frequent.

Not a milestone, an ongoing habit: every milestone above should go through Claude Code for
review/refactor/tests/docs at some point — that's the "daily AI-assisted workflow" line from
the target list, and it's already how this project works.
