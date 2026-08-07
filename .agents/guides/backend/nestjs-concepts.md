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

## `@Inject()` + custom provider tokens (the `DRIZZLE` pattern)

`@InjectRepository(XEntity)` (TypeORM) worked because `XEntity` is a real class — decorator
metadata can reflect a class reference at runtime, so Nest's DI can use the class itself as
the lookup key. Drizzle has no such class: the DB client is a plain object returned by
`drizzle(pool, { schema })`, and a `pgTable(...)` schema export is a plain const, not something
`emitDecoratorMetadata` can turn into a lookup key. This is exactly the case the "Terms to fill
in" note above used to flag: *"needed once dependencies are expressed as interfaces (no
runtime type to reflect on)"* — that's now.

The fix is a custom provider token — any unique value (a string, or here a `Symbol`) that
stands in for "the thing this provider constructs," registered explicitly instead of relying
on reflected class metadata:

```ts
// src/db/drizzle.module.ts
export const DRIZZLE = Symbol('DRIZZLE');

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => drizzle(pool, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule {}
```

Consuming it needs `@Inject(DRIZZLE)` instead of a bare constructor-parameter type, because
there's no class for Nest to reflect — the token has to be named explicitly at the injection
site too:

```ts
constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}
```

## Module `imports`/`exports` in practice (`@Global()` modules)

There's no `forFeature`-per-entity call anymore — Drizzle has no per-table repository object
to register, just the one shared client. `DrizzleModule` is marked `@Global()` and imported
once, in `AppModule`. A normal (non-global) module's providers are **private to the module
that imported them** by default — that's still true here, and is the same visibility rule that
mattered for the old per-entity `TypeOrmModule.forFeature` setup. `@Global()` is the escape
hatch: mark a module global, import it once anywhere in the graph (root is conventional), and
every other module can inject its exported providers without importing it themselves. Right
tool here specifically because *every* feature module needs DB access — the per-entity
`forFeature` approach made sense when each module only needed one specific repository; a
single shared DB client used everywhere is exactly the "used almost universally" case
`@Global()` exists for. Overusing `@Global()` for things that aren't truly cross-cutting would
undo the "module boundaries are enforced" property described above — this is the one exception,
not the default.

## Guards + `APP_GUARD` (the `ApiKeyGuard` pattern, M7)

A guard is a class implementing `CanActivate` — one method, `canActivate(context)`, returning
(or resolving to) `true`/`false`. Nest runs it **before** the matched route handler; return
`false` (or throw) and the handler never executes at all — the controller method's body never
runs, the request never touches business logic.

Applying a guard to one controller is `@UseGuards(SomeGuard)` on that class. `ApiKeyGuard`
needs to run on *every* route in the app, so it's registered differently — as a provider under
the special `APP_GUARD` token in `AppModule`:
```ts
providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
```
`APP_GUARD` isn't a token this project invented (unlike `DRIZZLE`, a plain `Symbol` we made up
ourselves) — it comes from `@nestjs/core`, and Nest's DI container specifically recognizes it:
a provider registered under this token is automatically wired as a **global** guard, run on
every request, without `@UseGuards()` on each controller (and without the risk of forgetting
it on a new one).

Skipping the guard on specific routes (`POST /projects`, the one endpoint that has to work
*without* an API key — there's no key to send before a project exists) uses `Reflector` +
custom metadata, the same decorator+metadata mechanism `@Roles()`-style guards use everywhere
in the Nest ecosystem:
```ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```
`@SetMetadata(key, value)` attaches an arbitrary tag to a route handler (or a whole
controller) — it doesn't do anything by itself, it just stores the tag where a guard can read
it later via `Reflector`:
```ts
const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
  context.getHandler(),
  context.getClass(),
]);
```
`getAllAndOverride` checks the specific method first (`getHandler()`), then falls back to the
controller class (`getClass()`) — so `@Public()` can be put on one method or on a whole
controller. `ExecutionContext` (the `canActivate(context)` parameter) is what makes a guard
work across HTTP/WebSockets/RPC uniformly — `context.switchToHttp().getRequest()` is the
HTTP-specific way of getting the actual `Request` object once you know you're in an HTTP
context (this project never needs the other transports, but the API shape assumes they might
exist).

- Pipes / Interceptors — same decorator+metadata mechanism, different hook points in the
  request lifecycle. Still unfilled — land here whenever the project actually uses one.
