@../../AGENTS.md
@AGENTS.md

# apps/web — local conventions

Cross-cutting build/git/architecture conventions live in the root `AGENTS.md` (first include
above). The second include (`AGENTS.md`, this directory's own) is Next.js's own
auto-regenerated version-drift warning, not a project convention — see that file's own
contents, don't edit it by hand.

## Tooling

Scaffolded via `create-next-app` (TypeScript, App Router, Tailwind CSS, ESLint, no `src/`
directory). M6 picked the concrete choices: shadcn/ui (on `@base-ui/react`, not Radix) +
Tailwind for components, plain server-side `fetch` (`cache: "no-store"`) for data — no
client-state library, since the dashboard is currently 100% read-only Server Components.

**React Aria** (`react-aria-components`) is the planned choice for complex interactive form
components (date range picker for M17's results filtering, combobox, etc.) — decided
2026-08-11, **not added yet** as of M14. M15 (multi-user auth) is the first real form screen
(login/signup) — the "don't add speculatively" discipline would normally have waited longer
(a plain login form doesn't need a combobox/date-picker library), but the developer
explicitly asked to install React Aria as part of M15 anyway, reasoning it'll be useful soon
regardless — see `.omc/plans/oauth-multi-user-auth.md` for the full call. Once M15 lands,
this note should be updated to say React Aria is in, not planned.
