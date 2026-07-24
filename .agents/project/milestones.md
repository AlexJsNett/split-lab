# Milestones

Work through these roughly in order. Each one should end in something runnable. Milestones
from M9 onward map directly to specific lines in `target-stack.md` — that's deliberate.

`CLAUDE.md` tracks only the current milestone; this file is the full list — open it when
planning the next one or checking what's still ahead.

- [x] **M1 — NestJS skeleton**: `nest new`, `GET /health` returns 200, TypeScript configured,
      dev script with hot reload. Wire `dev:api` at the root to run it.
- [ ] **M2 — Data layer**: Docker Compose with a Postgres container, TypeORM connected,
      entities for `Project` and `FeatureFlag`, migrations (not `synchronize: true`).
- [ ] **M3 — Projects & Flags CRUD**: NestJS controllers/services/DTOs, `class-validator`
      input validation, meaningful error responses (RESTful conventions — status codes,
      resource-oriented routes).
- [ ] **M4 — Experiments & assignment**: experiments + variants CRUD, the deterministic
      assignment endpoint (`GET /experiments/:id/assign?userId=`), log an exposure event
      on assignment. Apply SOLID where it's actually warranted (e.g. an `AssignmentService`
      that's easy to unit test in isolation) — don't force patterns where they don't fit.
- [ ] **M5 — Conversion tracking & results**: `POST /events` for conversions, an aggregation
      endpoint that returns per-variant exposure count, conversion count, conversion rate.
- [ ] **M6 — Frontend wired to the real API**: replace the Next.js boilerplate with a
      dashboard that lists projects/flags/experiments and shows results. Frontend stays
      dumb — no logic Next.js doesn't need.
- [ ] **M7 — Auth**: API key guard in Nest (the `Project.apiKey` field already fits this),
      reject unauthenticated requests.
- [ ] **M8 — Tests**: Jest unit tests, starting with the assignment/bucketing logic since
      it's the trickiest bit to get right. Add a couple of e2e tests with Nest's test utils.
      (Note: as of the 100% coverage policy, tests land alongside every milestone, not
      deferred to here — this milestone is really "close any remaining gaps.")
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

Not a milestone, an ongoing habit: every milestone above should go through Claude Code for
review/refactor/tests/docs at some point — that's the "daily AI-assisted workflow" line from
the target list, and it's already how this project works.
