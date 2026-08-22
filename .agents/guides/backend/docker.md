# Docker & Docker Compose (M13)

`target-stack.md` asks for hands-on Docker experience. M13 is where it actually lands: one
`docker compose up --build` brings up all six services — `postgres`, `rabbitmq`,
`elasticsearch`, `apps/api`, `apps/event-processor`, `apps/web` — wired together, instead of
each piece run by hand in its own terminal (`pnpm dev:api` / `pnpm dev:events` / `pnpm dev:web`
+ `docker compose up -d postgres rabbitmq elasticsearch`, the pre-M13 workflow, which still
works and still has its uses — see "Two workflows, on purpose" below). It's also the natural
home for the live cross-service golden-path e2e M10 deliberately deferred (D8) — see "The
isolated e2e stack" below.

First-time-with-Docker developer: this is your practice ground. Read this before touching
`Dockerfile`/`docker-compose.yml` again — every decision here has a concrete reason, not just
"this is how it's done."

## Image, container, volume — the three nouns that keep getting confused

- **Image**: a read-only, layered filesystem snapshot plus metadata (what command to run,
  what port to expose). Built once from a `Dockerfile`, then reused. `apps/api/Dockerfile`
  produces one image; `docker compose up --build` builds it, tags it, and reuses that same
  image every time you start the stack unless something invalidates the cache (see layers,
  below).
- **Container**: a running (or stopped) *instance* of an image — a process with its own
  filesystem view, network namespace, and (usually) one main process. You can run the same
  image as many containers as you want; each gets its own writable layer on top of the image's
  read-only layers. `docker compose up` creates one container per service.
- **Volume**: durable storage that survives a container being removed. `postgres-data`,
  `rabbitmq-data`, `elasticsearch-data` in `docker-compose.yml` are volumes — delete the
  `postgres` *container* and the data is still there; `docker compose down -v` is what actually
  wipes it (the `-v` matters — plain `down` leaves volumes alone).

## Layers and why `deps` is copied before `COPY . .`

Every `Dockerfile` instruction (`RUN`, `COPY`, ...) creates a new layer. Docker caches layers
and reuses a cached layer if — and only if — that instruction *and every instruction before
it* are unchanged since the last build. This is why every app's `Dockerfile` here has this
shape:

```dockerfile
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/event-processor/package.json apps/event-processor/
COPY apps/web/package.json apps/web/
COPY packages/events-contract/package.json packages/events-contract/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm exec turbo run build --filter=@split-lab/api
```

If `pnpm install` ran *after* `COPY . .`, editing a single `.ts` file would invalidate the
cache for that `COPY` and every layer after it — including the install — so every source
change would re-download the entire `node_modules` tree. Copying only the manifests first
means `pnpm install --frozen-lockfile` only re-runs when a dependency actually changes. This is
the single Docker idiom most worth internalizing from this milestone; `docker build` printing
`---> Using cache` next to the `deps` stage on a source-only change is the proof it's working.

**Why every app's `deps` stage copies all four `package.json` files**, even though (say)
`apps/api/Dockerfile` only ever runs `apps/api`: `pnpm install --frozen-lockfile` validates the
lockfile against the *entire* workspace, not just one package. A missing member manifest makes
the install fail (or, worse, silently drift). Cheap to copy, so just always do it.

## The build context, and why it's the repo root

`docker-compose.yml`'s app services all set `build: { context: ., dockerfile: apps/api/Dockerfile }`
— context is the repo root, not `apps/api/`. `COPY` can never reach *above* its context (a
`COPY ../foo .` is a hard error), and `@split-lab/events-contract`
(`packages/events-contract/`) lives outside `apps/api/` entirely but is a real runtime
dependency of it (it exports `EVENT_PATTERN`, a value, not just types — it has to exist as real
files inside the image). Root context is what makes `COPY packages/events-contract/ ...`
possible at all.

**`.dockerignore`** (repo root) is what keeps that big a context sane: the build context is
tarred and sent to the Docker daemon *before anything else runs*, so without it every build
would ship the host's `node_modules` (macOS/arm64 native binaries like `sharp` that can't run
in a linux container — `apps/web`'s build would fail on exactly this if it ever got copied in),
every `dist/`/`.next/` build artifact, and every `.env` secret. One file, and it's the
difference between a 10-second and 3-minute build context upload.

## Multi-stage builds and build targets

A `Dockerfile` can have more than one `FROM`, each starting a new **stage**. `docker build
--target <name>` (or compose's `build: { target: <name> }`) picks which stage to actually build
and tag — everything after it in the file is ignored. `apps/api/Dockerfile` has three usable
targets built off the same `build` stage:

- **`runtime`** — what actually serves HTTP traffic (`CMD ["node", "dist/app/main"]`).
- **`tooling`** — the same build, but `src/` and devDependencies are still present (nothing's
  been pruned). Used by the `migrate` compose service (`command: pnpm run migration:run`,
  which is `ts-node` reading `src/migrations/*.sql` — it needs `ts-node` and the raw
  migration files, neither of which the webpack-bundled `runtime` image has) and for the
  manual reindex (`docker compose run --rm migrate pnpm run search:reindex`).

One `Dockerfile`, several images — a genuinely useful pattern beyond just this project.

**Why `runtime` still copies the whole `node_modules` tree** instead of starting from a clean,
minimal stage: `nest build` (via `nest-cli.json`'s `"webpack": true`) produces a *small* bundle
(`dist/app/main.js` — 135 KB for `apps/api`, 24 KB for `apps/event-processor`) because it
**externalizes** real dependencies (`pg`, `@nestjs/*`, `@elastic/elasticsearch`, ...) rather
than inlining them. A "copy only `dist/`" image looks tempting and boots straight into
`Cannot find module '@nestjs/core'`. `runtime` inherits from `build` specifically so those
dependencies are still there.

That in turn is why the image can't just `pnpm deploy` a pruned, self-contained `node_modules`
either (the "obviously more correct" answer): pnpm links `node_modules` as symlinks into a
shared, content-addressed `.pnpm` store, and copying only `apps/api/node_modules` between
Docker stages breaks those symlinks. `pnpm deploy --filter ... --prod` exists to solve exactly
this, but on this pnpm version it needs `inject-workspace-packages=true` in `.npmrc`, which
changes how the *whole workspace* installs on the host too — too much blast radius for this
milestone. The images here are a few hundred MB bigger than they need to be as a result (they
include devDependencies); M14 is the natural place to slim that down if it ever matters. Not
done here on purpose — see the plan's guardrails.

## `depends_on`'s three conditions

```yaml
depends_on:
  postgres:
    condition: service_healthy
  migrate:
    condition: service_completed_successfully
```

Compose has three distinct conditions, and they mean different things:

- **`service_started`** (the old, implicit default) — the container process was spawned.
  Nothing about whether it's actually *ready*. Enough for services with no real startup delay,
  wrong for a database.
- **`service_healthy`** — the service's `healthcheck:` is passing. What `api` waits for on
  `postgres`/`rabbitmq`/`elasticsearch`/`event-processor` before it starts.
- **`service_completed_successfully`** — the service *ran to completion* with exit code 0.
  What `api`/`event-processor` wait for on `migrate` — a one-shot job, not a long-running
  service (`restart: "no"`).

**Why `migrate` is a separate one-shot service, not an entrypoint script** that migrates then
starts the server: an entrypoint script couples "apply schema changes" to "start the process"
— every replica of a scaled service would race the same migration, and a migration failure
just looks like a crash-looping app instead of one clearly-failed job you can see in `docker
compose ps`. The one-shot-service shape makes the step visible on its own.

## Healthchecks, and the single-node Elasticsearch trap

```yaml
elasticsearch:
  healthcheck:
    test: ["CMD-SHELL", "curl -fsS 'http://localhost:9200/_cluster/health?wait_for_status=yellow&timeout=5s' || exit 1"]
    start_period: 60s
```

Elasticsearch cluster health is one of `red` (data missing), `yellow` (all primary shards
allocated, but replicas aren't — normal and *permanent* for a single-node cluster, since there's
no second node to put a replica on), or `green` (fully replicated). Waiting for `green` on a
single-node dev cluster hangs until the healthcheck's own retry budget runs out and the
container is reported unhealthy — a genuinely confusing first Docker-Compose-with-Elasticsearch
experience if you don't know this going in. `wait_for_status=yellow` is correct here, not a
compromise.

`start_period: 60s` matters too: the JVM's own boot time is slow, and failures during
`start_period` don't count against `retries` the way failures after it do — without this, a
healthcheck with a tight `interval`/`retries` can mark Elasticsearch unhealthy before it's even
finished starting.

**Shallow vs deep health checks (`apps/api`'s and `apps/event-processor`'s own `GET
/health`):** both return a bare `{ status: 'ok' }` — no Postgres/RabbitMQ/Elasticsearch pings.
This is deliberate, not laziness: Postgres, RabbitMQ, and Elasticsearch each already have their
own healthcheck in this file, and `api`/`event-processor` already sit behind `depends_on:
condition: service_healthy` on all of them — by the time either app's own healthcheck runs,
its dependencies were already confirmed healthy once. If `GET /health` *also* pinged them and
one had a transient hiccup after startup, the app container would be marked unhealthy for a
problem restarting *that* container can't fix — noise, not signal. A health check should answer
"am I, this process, up," not "are my dependencies up" (they have their own checks for that).

## `apps/event-processor` becomes a hybrid app — and why that's not decoration

Before M13, `apps/event-processor` had no HTTP server at all — just
`NestFactory.createMicroservice(...)` consuming RabbitMQ. It couldn't have a Docker healthcheck
(there was no port to check), which is a real gap: `apps/api` publishes events with
`noAssert: true` (it never declares the queue itself — `event-processor` is the sole topology
owner, asserting it once at boot), so **if `api` starts accepting HTTP traffic before
`event-processor` has finished asserting the queue, a published message has nowhere to route
to and RabbitMQ silently drops it** — no error, no retry, just gone. "The container started"
was never a safe proxy for "traffic is safe to send."

M13's fix, in `apps/event-processor/src/app/main.ts`:

```ts
const app = await NestFactory.create(AppModule);
app.connectMicroservice<MicroserviceOptions>({ transport: Transport.RMQ, options: { ... } });
await app.startAllMicroservices();   // <-- must resolve before the next line
await app.listen(3000);              // HTTP only opens once RMQ is actually consuming
```

This is a **hybrid app** — one Nest process serving both an HTTP endpoint and a message
consumer. The ordering is the entire point: `GET /health` only starts responding 200 *after*
`startAllMicroservices()` resolves, which is when the queue assertion and consumer registration
have actually happened. That makes "the health check passes" a true proxy for "this worker is
genuinely consuming," not just "the process didn't crash" — `docker compose up --wait` and
`depends_on: event-processor: condition: service_healthy` can then gate on it directly, and the
D8 golden-path test doesn't need to poll RabbitMQ's management API itself to find out the same
thing.

## `localhost` inside a container is not the host

The single most common first-Docker-Compose mistake: every service in `docker-compose.yml`
sits on one Compose-managed bridge network with an embedded DNS server, so `postgres` resolves
to *that container's* address from any other service on the same network — but `localhost`
*inside* a container always means that container itself. `apps/api`'s own `.env` says
`DB_HOST=localhost` (correct for `pnpm dev:api`, running directly on the host); the compose
`environment:` block for the `api` *service* instead sets `DB_HOST: postgres`. This is exactly
why `docker-compose.yml` doesn't `env_file:` the existing `.env` files — they're gitignored,
point at `localhost`, and would silently produce a half-configured stack. Every value is set
explicitly, inline, in `docker-compose.yml`'s `environment:` blocks, so the whole wiring is
readable in one screen instead of split across untracked files.

## `apps/web`: runtime env, not build-time

`apps/web/app/_shared/lib/api.ts`'s `apiFetch` reads `process.env.API_URL` — and it's called
only from Server Components, so it's a **server-side, request-time** env var
(`environment: API_URL: http://api:3000` in compose is enough; nothing needs to happen at
`next build` time). This would be different for a `NEXT_PUBLIC_*` variable: Next.js *inlines*
those into the client-side JavaScript bundle at build time, which means changing one requires a
rebuild, and setting it means passing `build: { args: { ... } }` in compose rather than a
runtime `environment:` entry. `apps/web` doesn't currently have any `NEXT_PUBLIC_*` vars, but
this is the distinction to reach for the moment one shows up.

Also **why `apps/web`'s runtime is plain `next start`, not `output: "standalone"`**: standalone
output needs a `next.config.ts` change plus `outputFileTracingRoot` pointing at the monorepo
root to trace workspace files correctly, and its failure mode ("works locally, 500s only
inside the container") is a rough first Docker-debugging experience. `next start` on the full
copied `/app` tree is the boring, obviously-correct choice for this milestone — slimming it is
a natural M14 follow-up, not done here.

## Two workflows, on purpose

Pre-M13's per-service workflow (`pnpm dev:api`, `pnpm dev:events`, `pnpm dev:web`, each with
hot reload, plus `docker compose up -d postgres rabbitmq elasticsearch` for just the infra)
still works and is still the faster inner loop for day-to-day feature work — no image rebuild
between edits. M13 adds a second, complementary workflow (`docker compose up --build`, the
whole stack, no host Node process at all) for "does this actually work as a deployed system,"
not a replacement. That's also why `api`'s compose port is **`3001`**, not `3000` —
`pnpm dev:api` already owns 3000 on the host, and the two are meant to coexist without a
developer having to remember to stop one before starting the other.

## The isolated e2e stack (D8)

`pnpm e2e:stack` (`scripts/stack-e2e.sh`) is the live cross-service golden-path test M10
deliberately deferred: a real black-box test hitting `GET /assign` → `POST /conversions` →
`GET /results` against the whole stack running together — both `apps/api` and
`apps/event-processor` actually up, unlike M10's two separate, isolated e2e suites.

It runs against **`docker-compose.e2e.yml`**, a fully separate, self-contained compose file —
not an override layered on `docker-compose.yml` with a second `-f`. The reason is a real
Compose footgun worth knowing: list-valued keys like `ports` are **additive** when you merge
multiple `-f` files, not replaced — an override file that set `ports: []` would silently *not*
clear the base file's published ports. Since the whole point of the isolated stack is
publishing **nothing** (so it can run concurrently with the dev stack, `docker compose up`,
without fighting over host ports 5432/5672/9200/3001), a second, independent file with no
`ports:` keys at all is the safe, unambiguous way to guarantee that — not a maintenance
shortcut, a correctness requirement. `scripts/stack-e2e.sh` passes `-p splitlab-e2e` too, which
gives the run its own containers, volumes, *and* network — `down -v` at the end wipes only
that project's data, never the dev stack's.

The test itself lives in `tests/stack-e2e`, a new workspace package (`pnpm-workspace.yaml`
gained a `tests/*` entry) that imports nothing from either app — only `jest`, `ts-jest`, and
the platform `fetch()`. That's deliberate: M10 deferred this test specifically because wiring
it inside either app's own Jest run would need a fragile cross-package dev dependency and
sibling-`src/` module resolution. A package with zero imports from `apps/*` removes that
coupling instead of relocating it, and is also the only honest definition of "black-box" — if
it could `import { AppModule }`, it wouldn't be one. It runs as its own container inside the
`splitlab-e2e` network (`STACK_BASE_URL=http://api:3000`, never `localhost`), invoked with
`docker compose run --rm stack-e2e` — the same "one-shot job" shape as `migrate`, not a
long-running service.

`tests/stack-e2e/package.json`'s test script is named **`e2e`**, not `test`, on purpose:
Turborepo's `test` task runs every workspace package's `test` script, and this suite only
makes sense running inside the isolated compose network (it throws immediately if
`STACK_BASE_URL` isn't set) — naming it `e2e` keeps `pnpm -w test` from picking it up by
accident.

**Eventual consistency is the actual thing under test.** `GET /assign` returns as soon as
`apps/api` publishes the exposure event, before `apps/event-processor` has consumed and
persisted it — so `GET /results` doesn't reflect the assignment immediately. The test polls
`/results` until the expected totals show up (with a timeout and a message that prints the
last-observed payload on failure), the same "poll, don't sleep-and-assert-once" rule this
project already follows everywhere else eventual consistency shows up (Elasticsearch's own
near-real-time refresh delay, M12).

## A real gotcha this milestone surfaced: the missing `uuid-ossp` extension

The very first `docker compose up --build` from a truly clean state (`docker compose down -v`,
wiping the Postgres volume) failed on `migrate`'s very first `CREATE TABLE`, with
`function uuid_generate_v4() does not exist`. Every table's `id` column defaults to
`uuid_generate_v4()`, which comes from Postgres's `uuid-ossp` extension — and nothing in any
migration or init script had ever created it. It had apparently been enabled by hand, once,
directly on whatever Postgres instance this project was originally developed against, and
every migration since had silently depended on that one-time manual step.

This is exactly the kind of gap a genuinely fresh environment is good at finding — the
pre-M13 workflow's Postgres volume had just never been wiped, so the extension was always
already there. Fixed in `docker/init-test-db.sql` (which `docker-entrypoint-initdb.d` runs
against a fresh Postgres container automatically): `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`
against both `splitlab` (the main dev database) and `splitlab_test` (used by the host-run e2e
suites, and by `docker-compose.e2e.yml`'s own Postgres too — a separate container, separate
volume, same missing-extension problem, same fix). Worth remembering as a general lesson:
"works on my machine" for infrastructure often means "worked the one time I set this up by
hand, years ago" — a truly fresh `docker compose up -v` / `down -v` cycle is the only real way
to find out.
