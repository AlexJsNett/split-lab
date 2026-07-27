# Back-end Testing (Jest)

100% coverage policy (see `AGENTS.md`) means tests land with every milestone, not deferred to
M8 — M8 is "close any remaining gaps," not "write the first test."

## Unit tests: service/logic classes, mocked repository

Convention established in `manage-projects.service.spec.ts` (M3): mock the TypeORM
`Repository`, don't hit a real database. `Test.createTestingModule` builds a real Nest DI
graph for the test, but with a fake repository swapped in:

```ts
const module = await Test.createTestingModule({
  providers: [
    ManageProjectsService,
    { provide: getRepositoryToken(ProjectEntity), useValue: repository },
  ],
}).compile();
```

`getRepositoryToken(XEntity)` is the same DI token Nest uses internally for
`@InjectRepository(XEntity)` — providing a plain object under that token makes the service
think it received the real thing. The fake repository is a plain object of `jest.fn()`s (one
per `Repository` method the service actually calls — `create`, `save`, `find`, `findOneBy`,
`preload`, `delete`), programmed per-test via `mockResolvedValue`/`mockImplementation` to
return whatever that specific test needs. Rebuilt fresh in `beforeEach` so one test can't leak
state into the next.

This tests the service's *logic* (does it hash before saving, does it throw
`NotFoundException` when the repository reports nothing found, does the response ever leak
`apiKeyHash`) without depending on Postgres being up or caring what real SQL TypeORM would
generate.

## e2e tests: real app, real (dev) database

`test/*.e2e-spec.ts`, run via `pnpm run test:e2e` — boots the actual `AppModule` (real
`TypeOrmModule.forRootAsync`, real Postgres in Docker) and hits routes through `supertest`.
Used sparingly (per `AGENTS.md`'s testing policy, these complement rather than replace unit
tests) — currently just the M1 health check. Expand as controllers land, one happy-path e2e
per resource is enough; edge cases and branching belong in the unit tests above.

## Commands

- `pnpm test` — all unit tests (`*.spec.ts`)
- `pnpm test -- manage-projects.service` — a single file (Jest's own filename filter)
- `pnpm run test:e2e` — e2e suite
