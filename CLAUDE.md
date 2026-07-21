@AGENTS.md

# split-lab

Feature-flag / A/B-testing platform. Direction: growthbook.io-inspired (feature flags, experiments, rollout %, results), own scope, not a clone.

Purpose: this project is the training ground for the target stack below (job-requirement driven), not just "a fullstack app."

## Roles

- **You (developer)**: write all application code — `apps/api` in full, and later the real
  screens in `apps/web`. This is your Node.js + fullstack practice ground.
- **Claude (project manager)**: breaks work into milestones, reviews your code when asked,
  answers "how do I approach X" questions, owns tooling/CI config. Does not write business
  logic in `apps/api` or `apps/web` unless you explicitly ask for that milestone to be handed
  over. Default is: you write it, Claude reviews it.

Ask for a review with `/code-review` (or "review my API code") after each milestone below —
don't wait until the whole thing is done.

## Target stack (from job requirements)

Everything below drives the architecture and milestone choices in this doc. Keep it verbatim
so nothing gets lost in translation between the two source listings.

Technical requirements:
- Strong hands-on experience with NestJS.
- Experience with TypeORM.
- Strong experience with PostgreSQL.
- Good understanding of RESTful API design principles.
- Experience with unit testing (Jest or similar).
- Familiarity with AWS services (EC2, S3, Lambda) will be a plus.
- Excellent problem-solving and debugging skills.
- Strong communication and collaboration abilities.
- Experience with message brokers such as RabbitMQ or Kafka.
- Experience with Docker.
- Experience with Redis, MongoDB, or Elasticsearch.
- Understanding of microservice architecture.

Доповнення (укр.):
- 2.5+ роки з Node.js (TypeScript)
- Впевнений досвід з реляційними та нереляційними БД (PostgreSQL, MongoDB, Redis)
- SOA/мікросервіси: міжсервісна комунікація та процес розробки
- Сильна база в патернах проектування (SOLID, event-driven)
- Досвід інтеграції сторонніх REST API: авторизація, rate limits, ретраї, вебхуки, ідемпотентність
- Досвід асинхронної обробки / черг повідомлень (BullMQ, RabbitMQ або Kafka)
- Досвід роботи з хмарними провайдерами (AWS / GCP)
- Розуміння принципів масштабування та highload-систем
- Щоденне використання AI-асистентів (Claude Code, Cursor, GitHub Copilot) для розробки,
  рефакторингу, тестів та документації — вже closed, це і є твій поточний робочий процес
- Вміння писати ефективні промпти та перевіряти згенерований AI код — відповідальність за
  якість і безпеку залишається за розробником

## Architecture

Monorepo, npm workspaces, one root git repo.

```
split-lab/
  apps/
    web/   Next.js — frontend ONLY. Talks to apps/api over HTTP. No DB access, no business logic.
    api/   NestJS — backend. All domain logic, DB, auth, queues live here. <- your practice ground
  .github/workflows/ci.yml
```

`apps/web` is already scaffolded (create-next-app, TS + Tailwind + App Router). Treat it as
plain boilerplate — replace the default page with real screens only from M6 onward.

`apps/api` is intentionally empty except for a placeholder `package.json`. Framework and core
tech choices are now fixed by the target stack above (this is what you're training for, not a
free pick):

- Framework: **NestJS** (modules/controllers/providers/DI — this structure is the point, not
  incidental)
- ORM: **TypeORM**
- Primary DB: **PostgreSQL**
- Cache / queue backing: **Redis**
- Message broker: **RabbitMQ** (job listings name RabbitMQ or Kafka specifically; RabbitMQ is
  the more approachable starting point — do BullMQ-on-Redis first as an easy warm-up if you
  want, then RabbitMQ for the real "message broker" experience)
- Testing: **Jest** (Nest's default, no reason to swap)
- Containerization: **Docker** (docker-compose for Postgres + Redis + RabbitMQ locally)

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

Work through these roughly in order. Each one should end in something runnable. Milestones
from M9 onward map directly to specific lines in the target stack above — that's deliberate.

- [ ] **M1 — NestJS skeleton**: `nest new`, `GET /health` returns 200, TypeScript configured,
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

Not a milestone, an ongoing habit: every milestone above should go through Claude Code for
review/refactor/tests/docs at some point — that's the "daily AI-assisted workflow" line from
the target list, and it's already how this project works.

## Tooling already in place

- Root npm workspaces (`apps/*`)
- `npm run dev:web` — Next.js dev server
- `npm run dev:api` — will run once `apps/api/package.json` has a `dev` script (M1)
- `.github/workflows/ci.yml` — install, lint, typecheck, build on every push/PR (see below)
- `.gitignore` set up for node_modules, `.next`, `dist`, `.env`, sqlite/db files

## Working agreement

- Don't ask Claude to "just write the API" — ask for the milestone breakdown, a review, or
  an explanation of a concept instead.
- When stuck for a while (not immediately), it's fine to ask for a hint or to see how a
  specific pattern is usually done — just say so explicitly so Claude knows it's a
  deliberate exception, not the default mode.
