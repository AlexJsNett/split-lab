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

## `@Inject()` + custom provider tokens — the arc, closed

`@InjectRepository(XEntity)` (TypeORM) worked because `XEntity` is a real class — decorator
metadata can reflect a class reference at runtime, so Nest's DI can use the class itself as
the lookup key. Drizzle broke that: the DB client was a plain object returned by
`drizzle(pool, { schema })`, and a `pgTable(...)` schema export was a plain const, not something
`emitDecoratorMetadata` could turn into a lookup key. That forced a custom provider token — a
`Symbol('DRIZZLE')` registered explicitly and named at every injection site with
`@Inject(DRIZZLE)`, because there was no class for Nest to reflect on.

**Prisma undoes that need, for a genuinely structural reason, not a style change.**
`PrismaService` is declared as `class PrismaService extends PrismaClient { ... }` — a *real
class* with `@Injectable()` on it. Decorator metadata can reflect a class reference again, so
Nest's DI goes back to the plain, boring case: a bare constructor-parameter type is enough,
no token, no `@Inject()`, no `useFactory`:

```ts
// src/db/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL') }) });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

```ts
// any service that needs data access
constructor(private readonly prisma: PrismaService) {}
```

The general rule this leaves behind: **a custom provider token is only needed when the thing
being injected has no class for Nest to reflect on** — a plain object, a value returned from a
third-party factory function, an interface with no runtime representation. The moment the thing
being provided is an actual `class`, the token disappears and injection goes back to being a
constructor-parameter type, same as `AppService` in the very first example in this file.

## Module `imports`/`exports` in practice (`@Global()` modules)

There's no `forFeature`-per-entity call — Prisma's generated client exposes every model
(`prisma.project`, `prisma.featureFlag`, etc.) as a property of one shared instance, so there's
no per-table repository object to register the way TypeORM's `forFeature` needed. `PrismaModule`
is marked `@Global()` and imported once, in `AppModule`:

```ts
// src/db/prisma.module.ts
@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

A normal (non-global) module's providers are **private to the module that imported them** by
default — that's still true here, and is the same visibility rule that mattered for the old
per-entity `TypeOrmModule.forFeature` setup. `@Global()` is the escape hatch: mark a module
global, import it once anywhere in the graph (root is conventional), and every other module can
inject its exported providers without importing it themselves. Right tool here specifically
because *every* feature module needs DB access — a single shared DB client used everywhere is
exactly the "used almost universally" case `@Global()` exists for. Overusing `@Global()` for
things that aren't truly cross-cutting would undo the "module boundaries are enforced" property
described above — this is the one exception, not the default.

## Terms to fill in as they come up

- Guards / Pipes / Interceptors — same decorator+metadata mechanism, different hook points
  in the request lifecycle. Fill in once M7 (auth guard) lands.
