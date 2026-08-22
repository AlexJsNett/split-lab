# Root build context, same reasoning as apps/api/Dockerfile — though web
# doesn't depend on @split-lab/events-contract, `pnpm install --frozen-lockfile`
# still validates against every workspace member's package.json, so all four
# manifests are copied regardless of which app this image runs.
#
# No `output: "standalone"` here on purpose (M13, D6) — that needs a
# next.config.ts change plus outputFileTracingRoot pointing at the monorepo
# root, and its failure mode ("works locally, 500s in the container") is a
# bad first Docker debugging experience. `next start` on the full copied
# tree is the boring, obviously-correct choice for this milestone; slimming
# it is a natural M14 follow-up.
#
# API_URL is read at request time in a Server Component (apps/web/app/_shared/
# lib/api.ts), not a NEXT_PUBLIC_* var — nothing needs baking in at build
# time here. That would be different for a NEXT_PUBLIC_* var: those DO get
# inlined into the client bundle by `next build` and would need a
# `build: { args: ... }` in docker-compose.yml. See docker.md.

# ---- base ----
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/event-processor/package.json apps/event-processor/
COPY apps/web/package.json apps/web/
COPY packages/events-contract/package.json packages/events-contract/
# sharp (apps/web) compiles a native binary — this RUN must produce a LINUX
# binary, which is exactly why .dockerignore excludes the host's own
# node_modules (it would ship a macOS/arm64 sharp that next build can't load).
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
COPY . .
RUN pnpm exec turbo run build --filter=web

# ---- runtime ----
FROM build AS runtime
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
