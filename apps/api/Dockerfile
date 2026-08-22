# Built with the repo root as build context (see docker-compose.yml's
# `context: .` for this service) — @split-lab/events-contract lives outside
# apps/api, and COPY can never reach above its context, so the whole
# workspace has to be the context, not just this folder.
#
# One Dockerfile, several images (build targets): `runtime` is what actually
# serves traffic; `tooling` is the same build but with src/ and devDeps still
# present, used to run one-shot jobs like migrations (see docker-compose.yml's
# `migrate` service) that need ts-node, not the compiled webpack bundle.

# ---- base ----
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- deps ----  (cache layer: manifests only, so `pnpm install` is only
# re-run when a dependency actually changes, not on every source edit)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/event-processor/package.json apps/event-processor/
COPY apps/web/package.json apps/web/
COPY packages/events-contract/package.json packages/events-contract/
RUN pnpm install --frozen-lockfile

# ---- build ---- (also the base for the `tooling` target below — src/ and
# devDependencies are still here, nothing gets pruned until `runtime`)
FROM deps AS build
COPY . .
# turbo, not a bare `nest build` — turbo.json's dependsOn: ["^build"] builds
# @split-lab/events-contract first. A bare `nest build` would compile apps/api
# against an events-contract dist/ that doesn't exist yet in a fresh image.
RUN pnpm exec turbo run build --filter=@split-lab/api

# ---- tooling ---- (migrations: ts-node reading src/migrations/*.sql, needs
# devDependencies + src/ present — the webpack runtime bundle below has
# neither)
FROM build AS tooling
WORKDIR /app/apps/api

# ---- runtime ----
FROM build AS runtime
WORKDIR /app/apps/api
EXPOSE 3000
# nest build (webpack: true in nest-cli.json) externalises real dependencies
# into a small bundle (dist/app/main.js) rather than inlining them — that's
# why `runtime` still inherits node_modules from `build` instead of starting
# from a clean stage; a "copy only dist/" image would fail to boot on the
# first `require('@nestjs/core')`.
CMD ["node", "dist/app/main"]
