# NestJS Concepts

Living conceptual reference, not a tutorial — explanations added here as they come up while
building `apps/api`, tied to real code in this repo rather than generic examples. Read
`api-patterns.md` for the folder/architecture convention; this file is "why does Nest work
the way it does."

## Decorators — what they actually are

A decorator is a plain function that wraps a class (or method/property) at definition time
and attaches metadata to it. `@Injectable()` above a class is, under the hood, roughly
`AppService = Injectable()(AppService)`. Nothing magic — it's a TS/JS language feature, and
it's why `experimentalDecorators: true` is set in `tsconfig.json`.

The detail that actually matters: with `emitDecoratorMetadata: true` (also already set),
TypeScript emits the **constructor parameter types** as metadata when it compiles a
decorated class. Nest reads that metadata at runtime (via `reflect-metadata`, imported once
at the top of `main.ts`) to know what a class's constructor is asking for. Without this flag,
Nest's dependency injection literally could not work — it has no other way to know that
`AppController`'s constructor wants an `AppService`.

## What the core decorators do

- **`@Injectable()`** — marks a class as a *provider*: something Nest's DI container is
  allowed to construct and manage. Services, repositories, guards — anything Nest injects
  needs this (or an equivalent Nest-recognized decorator).
- **`@Controller('path')`** — marks a class as a route handler group. Method decorators
  inside it (`@Get()`, `@Post()`, etc.) map an HTTP verb + path to that method.
- **`@Module({ controllers, providers, imports, exports })`** — declares a cohesive unit.
  `NestFactory.create(AppModule)` in `main.ts` reads the root module's declaration to build
  the entire dependency graph at bootstrap.

## Dependency Injection — the actual mechanism

Without DI, a class would construct its own dependencies directly (`new AppService()` inside
`AppController`), hard-coupling it to one concrete implementation. With DI, a class instead
*declares what it needs* as a constructor parameter:

```ts
constructor(private readonly appService: AppService) {}
```

Nest sees (via the decorator metadata above) that this class's constructor wants an
`AppService`. It looks for `AppService` among the current module's `providers`, constructs
(or reuses — singleton per module by default) an instance, and passes it in. The consuming
class never knows or cares how `AppService` is built internally — only its public shape.

**Why this matters, concretely:**

1. **Testability** — swap the real `AppService` for a mock in a test via
   `Test.createTestingModule({...}).overrideProvider(AppService).useValue(mock)`, without
   touching `AppController` at all.
2. **Module boundaries are enforced, not just conventional** — a provider is only visible
   inside its own module unless explicitly added to that module's `exports`, and only
   usable by another module if that module `imports` the exporting one. This is the actual
   mechanism behind the FSD-ish `entities/<noun>/domain` vs `infrastructure` split from
   `api-patterns.md`: `domain/` stays framework-free (plain types/interfaces, no
   `@Injectable()`) on purpose, so business rules aren't entangled with Nest's DI machinery;
   `infrastructure/` holds the real providers Nest actually constructs and injects.

## Module `imports`/`exports` in practice (TypeOrmModule.forFeature)

Every `entities/<noun>/<noun>.module.ts` in this repo looks like:

```ts
@Module({
  imports: [TypeOrmModule.forFeature([ExperimentEntity])],
  exports: [TypeOrmModule],
})
export class ExperimentModule {}
```

`forFeature([X])` is different from the `forRootAsync(...)` call in `AppModule` — `forRootAsync`
configures the actual Postgres *connection* once, globally. `forFeature` says "given that
connection, register a `Repository<X>` as a provider inside this module" — one call per entity.

Providers added via `imports` are **private to the module that imported them** by default —
importing `ExperimentModule` elsewhere does not automatically expose `Repository<ExperimentEntity>`
to the importer. `ExperimentModule` itself has no controller/service — its only job is to make
DB access to that table available to *other* modules — so it must `export: [TypeOrmModule]` to
pass that repository provider along. Concretely: `ManageProjectsModule` does
`imports: [ProjectModule]`, and only because `ProjectModule` exports `TypeOrmModule` can
`ManageProjectsService` successfully `@InjectRepository(ProjectEntity)` in its constructor.
Forgetting the `exports` line produces the same `UnknownDependenciesException` seen earlier in
M2 — different root cause (visibility, not a version mismatch), same symptom.

## Terms to fill in as they come up

- `@Inject()` + injection tokens — needed once dependencies are expressed as interfaces
  (no runtime type to reflect on), lands around M2-M3.
- Guards / Pipes / Interceptors — same decorator+metadata mechanism, different hook points
  in the request lifecycle. Fill in once M7 (auth guard) lands.
