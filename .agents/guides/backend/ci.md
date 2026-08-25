# CI (GitHub Actions)

`.github/workflows/ci.yml` has existed since the repo's very first commit — this is not a
from-scratch milestone. M14's CI half is about closing real gaps in a workflow that already
ran lint/typecheck/test/build and already had an affected-only `--filter` pattern, not writing
one from nothing. The single most important finding that shaped everything below: before M14,
**every CI run in this repo's history was on `push` to `main`, never on a `pull_request`** —
the developer commits straight to `main`, always has. A "test gate" that only ever runs after
the commit is already on `main` isn't a gate, it's a notification.

## The gate is on **deploy**, not on **merge**

The obvious fix for "CI runs too late" is usually "require a passing check before merging a
PR." That's not what this project does, on purpose — the developer explicitly declined a
PR-required flow. Push straight to `main` stays exactly the workflow it already was. What
actually changed: **Render's deploy now waits for CI**, where before it didn't.

Before M14, Render's own "Auto-Deploy" fired on every push to `main`, completely decoupled
from this workflow — the two ran in parallel, unaware of each other. A push with a failing
test would still deploy; CI going red was just a notification arriving after the fact,
sometimes after a bad deploy was already live. M14 replaces that wire:

1. Render's "Auto-Deploy" is now **off** on all three Web Services (`split-lab`/api,
   `split-lab-events`/event-processor, `split-lab-web`/web) — a per-service dashboard setting,
   done by hand, not scriptable.
2. Each service exposes a **Deploy Hook** — a webhook URL that, POSTed to, triggers a deploy of
   that service's latest commit. These three URLs are held as GitHub Actions repo secrets
   (`RENDER_DEPLOY_HOOK_API`, `RENDER_DEPLOY_HOOK_EVENTS`, `RENDER_DEPLOY_HOOK_WEB`) — they are
   **bearer tokens**, anyone holding one can trigger a deploy on demand, which is why they're
   secrets and not plain workflow `env:` values (contrast with the e2e job's DB/RabbitMQ/ES
   credentials below, which are deliberately *not* secrets — nothing about a local-infra
   throwaway password is confidential, and treating it as one just makes the real secrets
   harder to spot).
3. `ci.yml`'s `deploy` job runs `on: push` to `main` only (never `pull_request` — a PR must
   never deploy), gated on `ci-ok` succeeding, and does three `curl -X POST -f` calls, one per
   Deploy Hook, each read from its own secret into an `env:` block and never string-interpolated
   directly into the `run:` command (so GitHub's log-masking definitely catches it if it ever
   leaked). `-f` makes curl itself fail the step on a non-2xx response instead of quietly
   swallowing an error page as success.

Net effect: a push with a failing test now produces **no new Render deploy on any of the three
services** — demonstrated live, not assumed (see "Two real gotchas," below, for how that almost
wasn't true).

## Path filtering: two mechanisms, two different jobs

"Path-based triggers so web/api build independently" was already half-solved before M14 —
turbo's `--filter="...[origin/base]"` decided *which packages run which tasks*, graph-accurately
(a shared-package change correctly fans out to both Nest apps). What it couldn't do is avoid the
cost that comes *before* it: checkout, Node setup, and a full `pnpm install` of the whole
workspace ran regardless, task selection or not.

`dorny/paths-filter` now decides *whether a job starts at all* — that's where the install cost
actually lives. Filter groups:

| Group | Paths |
|---|---|
| `web` | `apps/web/**` |
| `backend` | `apps/api/**`, `apps/event-processor/**`, `packages/events-contract/**`, `docker/**`, `docker-compose*.yml` |
| `shared` | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.github/workflows/**` |

**Deliberately not a workflow-level `on: pull_request: paths:` filter.** This is the trap worth
naming explicitly: when a workflow or job is skipped by a top-level `paths:` filter, GitHub
reports **nothing at all** for it — not "success", not "skipped". A required status check that
never reports leaves things stuck on "Expected — waiting for status" forever. Path filters and
required checks are directly hostile to each other in their naive form.

The pattern that works: a `changes` job (always runs) computes booleans via `dorny/paths-filter`;
`backend`/`web`/`e2e` gate on those booleans with `if:` (a gated-off job reports `skipped`, a
real conclusion); one aggregator job, `ci-ok`, `needs: [changes, backend, web, e2e]`,
`if: always()`, fails only if a dependency's result was `failure`/`cancelled` — `skipped` is
fine, that's the entire point. `ci-ok` is the single thing the `deploy` job (and, transitively,
`smoke`) depends on.

## E2E: GitHub Actions `services:`, not `docker compose`

The 10 e2e suites (7 `apps/api`, 3 `apps/event-processor`) — the tests that actually exercise
Postgres + RabbitMQ + Elasticsearch, not mocks — had **never run in CI before this milestone**.
They live under `test/`, outside turbo's `rootDir`, behind a separate `test:e2e` script no task
referenced.

`services:` in the `e2e` job's definition starts Postgres/RabbitMQ/Elasticsearch containers on
the runner before any step runs, using the same images/credentials/health options
`docker-compose.yml` already uses — fully ephemeral, spun up for the job and destroyed when it
ends. The suites already expected infra on `localhost` (same as the host-run workflow), so no
test code changed — the entire adaptation is the `services:` block plus an `env:` block.

Two things that would otherwise cost real debugging time:

- **`services:` has no `volumes:`.** `docker/init-test-db.sql` (the `uuid-ossp` extension +
  `splitlab_test` database bootstrap — M13's own hard-won lesson) can't be mounted the way
  compose does it. It runs as an explicit `psql -f docker/init-test-db.sql` step instead,
  against the same file, before migrations — same fix, can't drift out of sync.
- **`packages/events-contract` isn't a turbo task in this job.** `test:e2e` is invoked directly
  via `pnpm --filter`, not through turbo, and this is a fresh runner with no build artifacts
  from other jobs — its `dist/` has to be built explicitly (`pnpm --filter
  @split-lab/events-contract build`) before anything imports it, or the import just fails.

Confirmed live via `services:` containers touching real infra: fully ephemeral, same isolation
patterns as local `pnpm test:e2e` (`splitlab_test` db name, `TRUNCATE ... CASCADE` between
suites, `RABBITMQ_QUEUE=events_test`, `ELASTICSEARCH_INDEX_PREFIX=splitlab-test`) — nothing here
ever touches the real dev or prod databases.

## `lint` used to auto-fix and discard the fix

Both Nest apps' `lint` script had `--fix` baked in. In CI, that meant every auto-fixable
violation was silently repaired *inside the disposable runner* and thrown away with it — only
genuinely unfixable rules could ever fail the build. `lint` is now the checking form (what CI
runs); `lint:fix` is the explicit mutating form for local use. Proven live: a deliberately
introduced auto-fixable violation (an unused `let` that should be `const`) now fails the build;
before this change it would have passed silently.

## Coverage: measured honestly, not assumed

AGENTS.md claims "100% test coverage, every milestone." Before M14, nothing checked that —
`coverageThreshold` didn't exist in either Jest config, and `passWithNoTests: true` meant an
accidentally-empty suite would report success rather than a red flag.

Measuring for real (`pnpm run test:cov`) rather than assuming the policy already held turned up
a real, honest gap:

| Package | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `apps/api` | ~61% | ~59% | ~58% | ~62% |
| `apps/event-processor` | ~67% | ~62% | ~61% | ~68% |

`coverageThreshold` is set at that measured floor (a ratchet, not a target) — setting it to 100
outright would go red on unrelated files this milestone never touched, the worst possible first
impression of a new gate. The `test` scripts now collect coverage by default (`--coverage`), so
turbo's existing `test` task enforces the threshold in CI with no separate workflow step needed
— local and CI agree. Full breakdown of where the gap actually is (mostly bootstrap files and a
handful of controllers/DTOs that only have indirect e2e coverage, not their own `.spec.ts`) is
in `testing.md`, not repeated here — that's where future milestones should look when raising
these numbers.

## Post-deploy smoke test, not a scheduled re-run of the isolated stack

The original idea for exercising the full cross-service golden path in CI was rerunning M13's
isolated `docker-compose.e2e.yml` stack (three image builds, six containers) on some
schedule. That never shipped. Instead: `tests/stack-e2e/golden-path.spec.ts` already reads
`STACK_BASE_URL` from `process.env` with **no `localhost` fallback** — a deliberate M13 design
choice so the suite could never silently run against nothing. The same property that made it
safe for the isolated compose network makes it equally usable against a **live** target — point
`STACK_BASE_URL` at `https://split-lab.onrender.com` and the exact same suite, unmodified,
becomes a real post-deploy smoke test.

The `smoke` job runs `pnpm --filter stack-e2e e2e` against the live URL, `needs: [deploy]`, only
after the three Deploy Hooks have actually fired. No `services:`, no infra to stand up — just
checkout + install + one Jest run against endpoints that are already live, which is also why
it's cheap enough to run on every push rather than needing to be limited to a schedule (a daily
cron doing the same check was discussed and explicitly **rejected**, not merely deferred — this
is a learning project with no real production traffic, so "catch drift while nobody's pushing"
wasn't worth the added complexity right now).

**On a red `smoke` run: nothing automated happens.** The job going red *is* the alarm. The real
protection is `ci-ok` running *before* deploy — if lint/typecheck/unit/e2e-in-ephemeral-
containers is red, the Deploy Hooks never fire and bad code never goes live at all. `smoke` is a
last-resort check for the rarer case where something passes `ci-ok` but still breaks in the live
cross-service path; the correct response to red is a human reading the log, then clicking
Render's "Rollback" on the previous successful deploy — a few clicks, already built into Render,
not something this repo re-implements. No "last known good deploy" tracking, no Render API calls
beyond the three Deploy Hooks already in Step 5's scope.

## Two real GitHub Actions gotchas, found live — not from documentation

Both of these were confirmed by actually breaking things on purpose and watching what happened
on real runs, not reasoned about in advance. Worth remembering as a category: GitHub Actions'
`if:`/`needs:` interaction has sharp, under-documented edges.

**1. A job's own `if:` silently drops the implicit `success()` check GitHub applies by
default.** `deploy` originally read `if: github.event_name == 'push'`. That looks like "only run
on a real push," but because it's a *custom* `if:`, GitHub no longer automatically requires
`needs: [ci-ok]` to have succeeded — the job would run on every push regardless of whether
`ci-ok` actually passed. A live red-then-green test happened to show "skipped" both times,
which *masked* the bug rather than proving safety. Fixed by writing the success check
explicitly: `needs.ci-ok.result == 'success'`.

**2. A job is auto-skipped whenever *any* job anywhere in its transitive needs graph was
itself skipped — not just its direct need.** Even with gotcha #1 fixed, `deploy` still silently
no-op'd on every push where path filtering skipped the `web` job (a backend-only or shared-only
change) — reproduced 2 for 2 — while `ci-ok`'s own reported result was genuinely `success` both
times. GitHub still short-circuited `deploy` to `skipped` because `web` (two levels up the
graph: `deploy → ci-ok → web`) never ran. `always()` is what opts a job back out of that
auto-skip; combined with the explicit result check from gotcha #1, the condition that's
actually correct in both directions is:

```yaml
if: always() && github.event_name == 'push' && needs.ci-ok.result == 'success'
```

Confirmed conclusively with the exact scenario that broke it twice: a backend-only push (`web`
correctly `skipped`, `ci-ok` genuinely `success`) — `deploy` and `smoke` both fired. Same
two-part condition applies to `smoke`'s `needs.deploy.result == 'success'` check, for the same
reason (its own transitive graph runs through `deploy → ci-ok → [...]`).

## A real flaky test, found by finally running these suites repeatedly

Running the e2e suites in CI for the first time (rather than occasionally by hand) surfaced a
genuine, reproducible race: `cleanSearchIndices`'s `deleteByQuery({ query: { match_all: {} } })`
between tests occasionally threw `version_conflict_engine_exception` — Elasticsearch's default
`conflicts: 'abort'` throws the whole cleanup call out on a single document whose version was
just bumped by a previous, fully-awaited test write, apparently down to ES's own internal
seqNo bookkeeping lagging a beat behind the write API resolving. Not a CI-infrastructure issue
(`services:` vs `docker compose` made no difference) and not a code bug in the app's own
`await` chains (the writes really were awaited before the HTTP response returned) — just
something `deleteByQuery`'s default behavior doesn't tolerate well between fast-running tests.

Fixed with `conflicts: 'proceed'`: a version conflict just means one document survives this
cleanup pass instead of erroring the whole call out; it gets swept on the very next
`cleanDatabase()` call, which is harmless since nothing asserts on it in the meantime. Verified
locally with 3 consecutive full green runs of the `apps/api` e2e suite before trusting it in CI.

## What was deliberately left alone

- **`pnpm audit`'s `continue-on-error: true`** — a documented decision tied to `security.md`'s
  A06 section (known findings deliberately accepted: an unused `multer` feature, dev-tooling-
  only transitive deps). Not revisited here; touching it would be scope creep.
- **No branch protection, no PR requirement on `main`.** There's nothing to require a check
  *against* — the gate lives on the deploy trigger, not on merge eligibility.
- **No container registry, no `render.yaml`, no infra-as-code.** The only deployment-shaped
  thing this milestone added is: Render's Auto-Deploy off, three `curl -X POST` calls gated on
  `ci-ok`. Render still builds its own Docker image from source on every deploy — genuinely
  two separate builds (CI's, thrown away after verifying the code compiles; Render's, the real
  deployable artifact) rather than "build once in CI, ship the artifact." That's a real,
  accepted inefficiency traded for not standing up a registry for a learning project.
- **No automated rollback.** Covered above — a red `smoke` run is a human alarm, not a trigger.
