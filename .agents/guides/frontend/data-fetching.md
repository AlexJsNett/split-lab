# Front-end Data Fetching

Not decided yet — `apps/web` is a fresh `create-next-app` scaffold (App Router, TS, Tailwind),
no data-fetching or component library picked. Concrete choices deferred to M6, when there are
real screens to build against (same "don't build ahead of the milestone that needs it" rule
this project follows elsewhere). Next.js's App Router + React's native `fetch` (with Server
Components doing reads server-side where it makes sense) is the likely default given no
significant client-only state exists in this app yet — a dashboard reading/writing REST
resources from `apps/api` doesn't obviously need Redux or a client cache library layered on
top, but that call gets made at M6, not speculatively here.

## Fill in once M6 lands

- Server Components + `fetch` vs. a client-side query/cache library (e.g. TanStack Query) —
  pick based on how much of the dashboard ends up client-interactive.
- Where the API base URL / fetch wrapper lives (a single `apiClient` used everywhere, not
  `fetch()` calls scattered through components).
- Component approach — hand-written vs. a library (shadcn/ui or similar) added on demand.
- Loading/error state convention used across dashboard screens (skeletons? spinners?
  shared boundary component?).
