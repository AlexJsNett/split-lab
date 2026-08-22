#!/usr/bin/env bash
# M13 (D8) — brings up the isolated splitlab-e2e stack, runs the golden-path
# test as its own container, then always tears down (even on failure), and
# propagates the test's real exit code to the shell. A one-line
# `up && run; down` in package.json can't do that last part cleanly — this
# script exists so `pnpm e2e:stack` actually fails CI/your terminal when the
# test fails, not just when compose itself errors.
set -uo pipefail

# So this script works regardless of the caller's cwd (`pnpm e2e:stack` from
# anywhere in the repo, not just the root) — docker-compose.e2e.yml's own
# relative paths (build context ".", the init-test-db.sql volume mount) are
# resolved relative to wherever `docker compose` is invoked FROM, not where
# this script lives.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# docker compose (the plugin subcommand) isn't installed everywhere this
# repo runs — docker-compose (the standalone binary) is the fallback AGENTS.md
# already documents for the dev stack. Same choice here, so this script
# doesn't assume one over the other.
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  COMPOSE=(docker-compose)
fi

PROJECT=splitlab-e2e

cleanup() {
  "${COMPOSE[@]}" -p "$PROJECT" -f docker-compose.e2e.yml down -v
}
trap cleanup EXIT

# Explicit service list — NOT a bare `up -d --build --wait` — is load-bearing
# here, not style: `stack-e2e` depends on `api`/`event-processor`, but
# nothing depends on `stack-e2e`, so an unqualified `up` would start it too
# (compose starts every service in the file unless told otherwise) and it
# would run concurrently with the explicit `run --rm stack-e2e` below —
# the suite firing twice against the same worker, silently. Naming only the
# two long-running app services here still brings up every service THEY
# depend on (postgres, rabbitmq, elasticsearch, migrate, reindex) — compose
# resolves the dependency graph automatically — it just doesn't also start
# the one-shot test runner early.
"${COMPOSE[@]}" -p "$PROJECT" -f docker-compose.e2e.yml up -d --build --wait api event-processor
up_status=$?
if [ "$up_status" -ne 0 ]; then
  echo "stack-e2e: infra/app services never became healthy — see logs above" >&2
  exit "$up_status"
fi

"${COMPOSE[@]}" -p "$PROJECT" -f docker-compose.e2e.yml run --rm stack-e2e
exit $?
