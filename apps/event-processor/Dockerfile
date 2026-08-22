# Near-mirror of apps/api/Dockerfile — see that file's comments for the full
# reasoning (root build context because of @split-lab/events-contract,
# manifest-only `deps` cache layer, turbo build so events-contract builds
# first, runtime inherits node_modules because the webpack bundle
# externalises real dependencies).
#
# No `tooling` target here (unlike apps/api) — this service owns no CLI
# scripts (no migrations, no reindex). It DOES get EXPOSE + a healthcheck
# now, unlike a bare RabbitMQ consumer, because M13/D4 turned it into a
# hybrid app with its own GET /health.

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
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
COPY . .
RUN pnpm exec turbo run build --filter=@split-lab/event-processor

# ---- runtime ----
FROM build AS runtime
WORKDIR /app/apps/event-processor
EXPOSE 3000
CMD ["node", "dist/app/main"]
