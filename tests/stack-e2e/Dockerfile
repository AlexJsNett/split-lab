# Root build context, same reasoning as the app Dockerfiles: pnpm install
# --frozen-lockfile validates against every workspace member's package.json,
# so all manifests are copied regardless of which package this image runs.
#
# Deliberately simpler than apps/api|event-processor|web's Dockerfiles — this
# package has no turbo build step (ts-jest compiles on the fly, nothing gets
# emitted to dist/) and depends on neither app (D7): it's just jest + ts-jest
# + a spec file, run as its own throwaway container inside the isolated
# splitlab-e2e compose network (D8) so it can address `api`/`event-processor`
# by service name instead of `localhost`.

FROM node:24-alpine
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/event-processor/package.json apps/event-processor/
COPY apps/web/package.json apps/web/
COPY packages/events-contract/package.json packages/events-contract/
COPY tests/stack-e2e/package.json tests/stack-e2e/
RUN pnpm install --frozen-lockfile

COPY tests/stack-e2e tests/stack-e2e
WORKDIR /app/tests/stack-e2e

CMD ["pnpm", "e2e"]
