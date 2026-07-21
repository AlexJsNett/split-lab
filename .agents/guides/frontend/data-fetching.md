# Front-end Data Fetching

Decided ahead of M6 so the provider is already in place when the real dashboard screens land.

- **React Query** (`@tanstack/react-query`), not Redux. This app is a dashboard reading/writing
  REST resources from `apps/api` — server state, which is exactly what Query handles
  (caching, invalidation, refetch, loading/error states). No Redux-worthy client-only state
  exists in this app yet; don't add it speculatively.
- Provider: `src/app/providers.tsx`, wrapping `{children}` in `src/app/layout.tsx`. Devtools
  (`ReactQueryDevtools`) mounted alongside it, closed by default.
- shadcn/ui components live in `src/components/ui/` (added via
  `npx shadcn@latest add <component>`, not hand-written) — use those before reaching for
  Radix directly or writing a component from scratch.

## Fill in once M6 lands

- Where the API base URL / fetch wrapper lives (a single `apiClient` used by every query/
  mutation hook, not `fetch()` calls scattered through components).
- Naming convention for query keys.
- Where query hooks live — likely colocated per screen/feature rather than a global
  `hooks/` bucket, to stay consistent with the screaming/FSD-ish approach on the backend.
- Loading/error state convention used across dashboard screens (skeletons? spinners?
  shared `<QueryBoundary>` wrapper?).
