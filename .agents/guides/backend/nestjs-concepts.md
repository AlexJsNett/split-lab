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

## Custom tokens, second use case: wrapping a global for testability (M11)

`DRIZZLE` above needed a token because there was no class to reflect on. `WEBHOOK_HTTP`
(`apps/api/src/features/push-results/webhook.config.ts`) needs one for a different reason:
Node's `fetch` is a **global function**, not a class or an injectable value at all — there's
nothing to `@Inject()` even in principle. Calling `fetch` directly from
`results-webhook.client.ts` would work fine at runtime, but every spec in this repo mocks
dependencies through Nest's DI container (`{ provide: TOKEN, useValue: mock }`); a bare global
can only be mocked by reassigning `global.fetch = jest.fn()`, which leaks across test files
unless carefully restored and matches nothing else here.

The fix: wrap the global in a plain object shaped like the one real dependency this app needs
from it (`{ post: (url, body, headers, timeoutMs) => Promise<Response> }`), and provide *that*
under a token like any other value:

```ts
export const WEBHOOK_HTTP = Symbol('WEBHOOK_HTTP');

async function webhookFetchPost(url: string, body: string, headers: Record<string, string>, timeoutMs: number) {
  return fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
}

export const fetchWebhookHttp: WebhookHttp = { post: webhookFetchPost };
```

```ts
// push-results.module.ts
{ provide: WEBHOOK_HTTP, useValue: fetchWebhookHttp }
```

`ResultsWebhookClient` injects `WEBHOOK_HTTP` and never imports `fetch` directly — specs mock
the token (`{ post: jest.fn() }`), same shape as `{ provide: DRIZZLE, useValue: db }`. Same
technique as `DRIZZLE`, applied for the opposite reason: not "no runtime class exists," but
"a real function exists, and it's outside DI's reach unless something wraps it."

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

## Microservices: a Nest app with no HTTP in it (M10)

Every app so far has been built with `NestFactory.create(AppModule)` — an *HTTP* application:
Nest wires up an Express/Fastify server underneath, `@Controller()` classes map to routes, and
`app.listen(port)` starts that HTTP server. `apps/event-processor/src/app/main.ts` does
something different: `NestFactory.createMicroservice(AppModule, options)`. Same `AppModule`,
same DI container, same `@Controller()`/`@Injectable()` mechanics — but there's no HTTP server
at all. `options.transport` picks what *is* listening instead (`Transport.RMQ` here, for
RabbitMQ); `app.listen()` starts consuming from the broker rather than binding a port. This is
why `apps/event-processor` needs no `@nestjs/platform-express` dependency — it never creates an
HTTP layer to begin with.

The controller shape barely changes either. `process-events.controller.ts` is a real
`@Controller()`, exactly like `AssignVariantController` in `apps/api` — it just has
`@EventPattern(...)` methods instead of `@Get()`/`@Post()` ones. Nest's routing concept (map an
incoming thing to a handler method) is transport-agnostic; only what counts as "an incoming
thing" changes (an HTTP request vs. a broker message).

## `@EventPattern` vs `@MessagePattern` — fire-and-forget vs request/response

Both decorators register a handler for an incoming message keyed by a "pattern" (here, the
string `'exposure'`/`'conversion'` from `@split-lab/events-contract`'s `EVENT_PATTERN`
constants) — the difference is what happens to the return value:

- **`@MessagePattern`** is request/response: the client that sent the message is waiting for a
  reply, and whatever the handler returns (or resolves to) gets sent back. This project doesn't
  use it anywhere yet.
- **`@EventPattern`** is fire-and-forget: nothing is waiting for a return value. The producer
  (`assign-variant.service.ts`) publishes and moves on; the handler
  (`process-events.controller.ts`'s `handleExposure`/`handleConversion`) does its work (insert
  into Postgres, ack/nack the message) with nothing to send back. This is the right shape for
  "record that this event happened" — the producer's job (`assign()` returning a variant to its
  own caller) doesn't depend on the worker's insert succeeding synchronously; that's the whole
  point of moving it off the request path back in M9.

## `ClientProxy` and why `emit()` has to be subscribed to

`ClientProxy` (injected via `@Inject('EVENTS_CLIENT')` in `assign-variant.service.ts` /
`log-conversion.service.ts`) is Nest's client-side handle to a transport — the producer's
equivalent of `DRIZZLE` for Postgres. `client.emit(pattern, data)` **does not publish
anything by itself** — like all of RxJS, an `Observable` is lazy: nothing happens until
something subscribes to it. `await firstValueFrom(client.emit(...))` both subscribes (which
triggers the actual publish) and converts the single emitted value into a `Promise` so it can
be `await`ed with ordinary `async`/`await` syntax instead of RxJS operators. Skipping the
`firstValueFrom`/subscribe step is a real, easy-to-make mistake — the code *looks* like it
published something, but the publish call was constructed and immediately discarded, and
nothing ever went out. Bonus: because the underlying RMQ client publishes over a
`ConfirmChannel`, the promise this resolves to doesn't just mean "the SDK call returned" — it
means the broker has actually confirmed and durably stored the message (see V10 in
`messaging.md`).

## `ClientsModule.registerAsync` — the same factory pattern, a third time

`assign-variant.module.ts`'s `ClientsModule.registerAsync([{ name: 'EVENTS_CLIENT', imports,
inject, useFactory }])` is structurally identical to `DrizzleModule`'s `useFactory` provider and
to M9's (now-removed) `QueueModule`'s `BullModule.forRootAsync` — the same "can't construct
this until `ConfigService` is available, so hand Nest a factory function plus its own
dependencies instead of a static value" pattern, applied a third time to a third kind of
connection (Postgres, then Redis, now RabbitMQ). Recognizing the shape once means recognizing
it everywhere: `useFactory` is called with whatever `inject` lists once those providers exist,
and its return value becomes the actual provided value (here, the `ClientProxy` options object
Nest uses to construct the RMQ client) — nothing new to learn each time this pattern shows up
again.

## The `DRIZZLE` shape, applied a second time to a second datastore (`ELASTICSEARCH`, M12)

`search.module.ts`'s `ELASTICSEARCH` token is the "no runtime class exists" case from `DRIZZLE`
above, not the "wrap a bare global" case `WEBHOOK_HTTP` needed — worth naming which is which,
since M12 could plausibly have gone either way and the actual reason for the choice is a small,
useful distinction: `@elastic/elasticsearch`'s `Client` **is** a real class (`new Client({node})`
constructs a real instance), so in principle `@Inject(Client)`-by-class-reference could work the
way `@InjectRepository(XEntity)` did for TypeORM. It's still given a `Symbol` token instead,
for the same practical reason `DRIZZLE` is: the actual value provided isn't just `new Client()`
— it's the result of a `useFactory` that needs `ConfigService` (for `ELASTICSEARCH_URL`) first,
so *something* has to be the provider key regardless, and a `Symbol` avoids ever accidentally
constructing a second, unconfigured `Client` instance elsewhere via a bare `new Client()`.
Contrast with `WEBHOOK_HTTP`: that token exists because `fetch` has literally nothing to
`@Inject()` — no class, no factory-constructible value, just a global function. `ELASTICSEARCH`
exists because the *construction* needs DI (config), not because there's no class at all. Same
token mechanism, two different underlying reasons — see that section above for the `WEBHOOK_HTTP`
side of the comparison.

`SearchModule` is `@Global()` and imported once in `AppModule`, exactly like `DrizzleModule` —
every feature module needing search (today: `search-catalog`; also the write side inside
`manage-experiments`/`manage-flags`) injects `ELASTICSEARCH`/`SEARCH_CONFIG`/
`SearchIndexerService` without importing `SearchModule` itself. Same "used almost universally"
justification `@Global()` needed the first time: a shared connection-level client, not a
per-feature concern.

`SearchModule implements OnModuleDestroy` and calls `client.close()` for the same reason
`DrizzleModule` calls `pool.end()`: Nest doesn't tear down a provider's underlying resources for
you just because the module shuts down — a service holding an open socket/connection has to
close it explicitly in `onModuleDestroy()`, or the process (in production) leaks it until exit,
and (in this e2e suite specifically) each spec file's `app.close()` never actually returns —
Jest hangs on the still-open Elasticsearch HTTP keep-alive connection instead of exiting
cleanly.
