# Back-end Data Layer (TypeORM/Postgres)

M2 in progress. Entity/migration/repository conventions still to fill in once entities land —
this section starts with a real gotcha hit while wiring the connection.

## Known gotcha: pin `@nestjs/core`/`common`/`platform-express`/`testing` to `11.0.1`

`npm install` on a fresh M2 setup resolves `@nestjs/core` to its newest version (`11.1.28` at
the time this was hit), but `@nestjs/typeorm@11.0.3` (itself the newest available) breaks
against it — app boot throws:

```
UnknownDependenciesException: Nest can't resolve dependencies of the TypeOrmCoreModule
(TypeOrmModuleOptions, ?). Please make sure that the argument ModuleRef at index [1] is
available in the TypeOrmCoreModule module.
```

Not a config mistake — `ModuleRef` is a Nest-internal class that's normally always injectable
without any explicit import. Confirmed by directly resolving both packages' `require()` paths:
they pointed at the exact same on-disk `@nestjs/core`, so it wasn't a duplicate-copy problem
either. Bisecting versions was what worked: pinning `@nestjs/core`, `@nestjs/common`,
`@nestjs/platform-express`, `@nestjs/testing` down to `11.0.1` (exact, via `--save-exact` —
no `^`, so a routine `npm install` can't silently drift back to the broken combo) fixed it —
`TypeOrmCoreModule dependencies initialized` and `/health` responds normally. Revisit the pin
once a newer `@nestjs/typeorm` release exists and confirms compatibility with current
`@nestjs/core`.
