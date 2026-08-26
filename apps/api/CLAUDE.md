@../../AGENTS.md

# apps/api — local conventions

Cross-cutting build/git/architecture conventions live in the root `AGENTS.md` (included
above) — this file is only what's specific to working inside `apps/api`.

## Folder architecture (target shape, fills in per milestone)

FSD-inspired + screaming + clean-architecture-lite, not the default Nest tutorial layout.
Full convention and rationale: `.agents/guides/backend/api-patterns.md` — read it before
adding a new feature, it decides where files go from the start.

- `entities/<noun>/` (domain + infrastructure) for things with a table behind them;
  `features/<verb>/` for use-cases that read/write them. No top-level
  `controllers/`/`services/`/`dto/` buckets.
- Drizzle schemas + migrations, no `drizzle-kit push` outside local scratch experiments.
- `class-validator` DTOs at the controller boundary — never trust raw request bodies past
  the DTO layer.
- Async work (event ingestion) goes through RabbitMQ to `apps/event-processor` (a separate
  NestJS microservice, M10 — BullMQ/Redis were used through M9, fully replaced since) — not
  inline in the request handler.

## Search reindexing

`pnpm run search:reindex` / `search:reindex:test` (mirrors `migration:run`/
`migration:run:test` — its own `Pool`+Drizzle+ES `Client`, no Nest DI) — rebuilds both
Elasticsearch indices from Postgres from scratch. Run it after `docker compose up -d
elasticsearch` the first time, and any time the search mapping changes; see
`.agents/guides/backend/search.md`.
