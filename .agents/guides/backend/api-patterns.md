# Back-end API Patterns (NestJS/REST)

Folder architecture decided ahead of M1 so the skeleton starts in the right shape instead of
getting restructured later. Synthesis of three things you asked for — FSD, screaming
architecture, clean architecture — translated from frontend-FSD to a NestJS backend:

- **Screaming**: top-level folder names say what the app *does* (`entities/feature-flag`,
  `features/assign-variant`), never what NestJS calls things (`controllers/`, `services/`,
  `dto/` as top-level buckets). Opening `src/` should scream "feature-flag platform," not
  "NestJS app."
- **FSD-inspired slicing**: `entities/` = core domain nouns with their data access.
  `features/` = business actions/use-cases that use one or more entities. No `pages/` or
  `widgets/` layer — those are frontend-only, meaningless on a backend.
- **Clean-architecture-lite**: inside a slice, `domain/` holds framework-free types and
  rules (no `@Injectable()`, no Drizzle imports); `infrastructure/` holds the NestJS/Drizzle
  wiring that implements/uses those types. Don't take this further than that for now — full
  ports-and-adapters with repository interfaces everywhere is more ceremony than a
  single-team project this size needs yet. Revisit if `apps/api` grows past a few
  entities/features and the coupling actually starts hurting.

## Target shape

```
apps/api/src/
  app/
    app.module.ts        # composition root — imports every entity/feature module
    main.ts               # bootstrap

  shared/
    config/                # env/config module
    exceptions/            # shared exception filters, if/when needed
    kernel/                # generic base types used across slices (e.g. a Result<T> type)

  entities/
    project/
      domain/              # Project type/interface, no framework imports
      infrastructure/       # Drizzle schema (pgTable)
      project.module.ts
    feature-flag/
      domain/
      infrastructure/
      feature-flag.module.ts
    experiment/            # lands M4
    variant/               # lands M4
    event/                 # lands M4/M5

  features/
    evaluate-flag/          # lands M3 — GET /projects/:id/flags/:key/evaluate
      evaluate-flag.service.ts
      evaluate-flag.controller.ts
      evaluate-flag.module.ts
    assign-variant/         # lands M4 — the deterministic bucketing use-case
      ...
    track-conversion/       # lands M5
      ...
```

Rule of thumb for "is this an entity or a feature": if it's a noun with a table behind it,
it's an entity. If it's a verb/use-case that reads or writes one or more entities, it's a
feature. A feature's controller lives next to its service, in the feature's folder — not in
a shared `controllers/` bucket.

## M1 scope (skeleton only)

M1 only needs `app/` (composition root + a health check) and `shared/config/`. No entities or
features exist yet — don't pre-build empty folders for M2+, add them when the milestone that
needs them lands.

## Filled in later

Once M3 lands (first real feature: evaluate-flag), update this doc with a concrete example of
the domain/infrastructure split for one real slice, DTO validation pattern, and how errors
surface to the client. Once M7 lands, add the auth guard pattern here too.
