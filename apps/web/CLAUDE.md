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
components (date range picker for M16's results filtering, combobox, etc.) — decided
2026-08-11, **not added yet**, same "don't add speculatively" discipline as M6: wait until
there's a real form screen that actually needs it. (Simple forms like login/signup don't
count — see whichever milestone/plan adds the first real form screen for the concrete call.)
